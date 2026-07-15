import fs from "node:fs/promises";
import path from "node:path";

const SOURCE_URL =
  process.env.SOURCE_URL || "https://www.joongang.co.kr/sports/soccer";
const OUTPUT_PATH =
  process.env.OUTPUT_PATH || "public/data/articles.json";
const TIME_ZONE = "Asia/Seoul";
const MAX_ARTICLES = positiveInteger(process.env.MAX_ARTICLES, 5);
const SCAN_LIMIT = positiveInteger(process.env.SCAN_LIMIT, 30);
const ENRICH_LIMIT = positiveInteger(process.env.ENRICH_LIMIT, 12);
const REQUEST_TIMEOUT_MS = positiveInteger(
  process.env.REQUEST_TIMEOUT_MS,
  20000
);

const REQUEST_HEADERS = {
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9," +
    "image/avif,image/webp,*/*;q=0.8",
  "accept-language": "ko-KR,ko;q=0.9,en;q=0.7",
  referer: "https://www.joongang.co.kr/sports",
};

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function decodeHtmlEntities(value = "") {
  const named = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
    middot: "·",
    ndash: "–",
    mdash: "—",
  };

  return String(value)
    .replace(/&#(\d+);/g, (_, number) =>
      String.fromCodePoint(Number.parseInt(number, 10))
    )
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) =>
      String.fromCodePoint(Number.parseInt(hex, 16))
    )
    .replace(/&([a-z]+);/gi, (match, name) => {
      return named[name.toLowerCase()] ?? match;
    });
}

function stripTags(value = "") {
  return decodeHtmlEntities(
    String(value)
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<svg\b[\s\S]*?<\/svg>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\s+/g, " ")
    .trim();
}

function cleanTitle(value = "") {
  return stripTags(value)
    .replace(/\s*[|｜]\s*중앙일보\s*$/i, "")
    .replace(/\s*[-–—]\s*중앙일보\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanSummary(value = "") {
  const summary = stripTags(value)
    .replace(/^(기사|사진|영상)\s*/i, "")
    .trim();

  if (summary.length < 20) return "";
  return summary.length > 190 ? `${summary.slice(0, 187).trim()}…` : summary;
}

function parseAttributes(tag = "") {
  const attributes = {};
  const expression =
    /([^\s"'<>\/=]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
  let match;

  while ((match = expression.exec(tag)) !== null) {
    attributes[match[1].toLowerCase()] = decodeHtmlEntities(
      match[2] ?? match[3] ?? match[4] ?? ""
    );
  }

  return attributes;
}

function normalizeArticleUrl(href) {
  try {
    const url = new URL(href, SOURCE_URL);
    if (!["joongang.co.kr", "www.joongang.co.kr"].includes(url.hostname)) {
      return null;
    }
    if (!/^\/article\/\d+/.test(url.pathname)) return null;

    url.protocol = "https:";
    url.hostname = "www.joongang.co.kr";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function isoFromKstParts(
  year,
  month,
  day,
  hour = 0,
  minute = 0,
  second = 0
) {
  const pad = (value) => String(value).padStart(2, "0");
  const candidate =
    `${year}-${pad(month)}-${pad(day)}T` +
    `${pad(hour)}:${pad(minute)}:${pad(second)}+09:00`;
  const date = new Date(candidate);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function parsePublishedDate(raw = "") {
  const text = decodeHtmlEntities(String(raw)).trim();
  if (!text) return null;

  const isoMatch = text.match(
    /(20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2}))/
  );
  if (isoMatch) {
    const normalized = isoMatch[1].replace(
      /([+-]\d{2})(\d{2})$/,
      "$1:$2"
    );
    const date = new Date(normalized);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }

  const numericMatch = text.match(
    /(20\d{2})[.\-/]\s*(\d{1,2})[.\-/]\s*(\d{1,2})(?:\s*(?:T|오전|오후)?\s*(\d{1,2}):(\d{2})(?::(\d{2}))?)?/
  );
  if (numericMatch) {
    let hour = Number(numericMatch[4] || 0);
    if (/오후/.test(numericMatch[0]) && hour < 12) hour += 12;
    if (/오전/.test(numericMatch[0]) && hour === 12) hour = 0;

    return isoFromKstParts(
      Number(numericMatch[1]),
      Number(numericMatch[2]),
      Number(numericMatch[3]),
      hour,
      Number(numericMatch[5] || 0),
      Number(numericMatch[6] || 0)
    );
  }

  const koreanMatch = text.match(
    /(20\d{2})년\s*(\d{1,2})월\s*(\d{1,2})일(?:\s*(오전|오후)?\s*(\d{1,2})(?:시|:)(\d{1,2})?)?/
  );
  if (koreanMatch) {
    let hour = Number(koreanMatch[5] || 0);
    if (koreanMatch[4] === "오후" && hour < 12) hour += 12;
    if (koreanMatch[4] === "오전" && hour === 12) hour = 0;

    return isoFromKstParts(
      Number(koreanMatch[1]),
      Number(koreanMatch[2]),
      Number(koreanMatch[3]),
      hour,
      Number(koreanMatch[6] || 0)
    );
  }

  return null;
}

function getDateKey(dateValue) {
  const date =
    dateValue instanceof Date ? dateValue : new Date(String(dateValue));
  if (Number.isNaN(date.getTime())) return "";

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );

  return `${values.year}-${values.month}-${values.day}`;
}

function findImageAlt(innerHtml = "") {
  const imageTag = innerHtml.match(/<img\b[^>]*>/i)?.[0] ?? "";
  return parseAttributes(imageTag).alt || "";
}

function findDateNear(html, start, end) {
  const slice = html.slice(
    Math.max(0, start - 250),
    Math.min(html.length, end + 1400)
  );
  return parsePublishedDate(stripTags(slice));
}

function findSummaryNear(html, end) {
  const slice = html.slice(end, Math.min(html.length, end + 1400));
  const paragraphMatches = [
    ...slice.matchAll(/<(?:p|div)\b[^>]*>([\s\S]*?)<\/(?:p|div)>/gi),
  ];

  for (const match of paragraphMatches) {
    const candidate = cleanSummary(match[1]);
    if (candidate) return candidate;
  }

  return "";
}

function extractArticleLinks(html) {
  const articles = new Map();
  const anchorPattern = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let match;
  let order = 0;

  while ((match = anchorPattern.exec(html)) !== null) {
    const openingTag = match[0].slice(0, match[0].indexOf(">") + 1);
    const attributes = parseAttributes(openingTag);
    const url = normalizeArticleUrl(attributes.href || "");
    if (!url) continue;

    const textTitle = cleanTitle(match[2]);
    const imageTitle = cleanTitle(findImageAlt(match[2]));
    const title =
      textTitle.length >= 5
        ? textTitle
        : imageTitle.length >= 5
          ? imageTitle
          : "";

    if (!title) continue;

    const candidate = {
      title,
      url,
      publishedAt: findDateNear(
        html,
        match.index,
        anchorPattern.lastIndex
      ),
      summary: findSummaryNear(html, anchorPattern.lastIndex),
      sourceOrder: order++,
    };

    const existing = articles.get(url);
    const candidateScore =
      candidate.title.length +
      (candidate.publishedAt ? 80 : 0) +
      (candidate.summary ? 40 : 0);
    const existingScore = existing
      ? existing.title.length +
        (existing.publishedAt ? 80 : 0) +
        (existing.summary ? 40 : 0)
      : -1;

    if (!existing || candidateScore > existingScore) {
      articles.set(url, {
        ...candidate,
        sourceOrder: existing?.sourceOrder ?? candidate.sourceOrder,
      });
    }
  }

  return [...articles.values()]
    .sort((a, b) => a.sourceOrder - b.sourceOrder)
    .slice(0, SCAN_LIMIT);
}

function getMetaContent(html, keys) {
  const normalizedKeys = new Set(keys.map((key) => key.toLowerCase()));
  const metaPattern = /<meta\b[^>]*>/gi;
  let match;

  while ((match = metaPattern.exec(html)) !== null) {
    const attributes = parseAttributes(match[0]);
    const key = String(
      attributes.property || attributes.name || attributes.itemprop || ""
    )
      .trim()
      .toLowerCase();

    if (normalizedKeys.has(key) && attributes.content) {
      return attributes.content.trim();
    }
  }

  return "";
}

function walkJsonLd(value, found) {
  if (!value || typeof value !== "object") return;

  if (typeof value.headline === "string" && !found.headline) {
    found.headline = value.headline;
  }
  if (typeof value.datePublished === "string" && !found.datePublished) {
    found.datePublished = value.datePublished;
  }
  if (typeof value.description === "string" && !found.description) {
    found.description = value.description;
  }

  if (Array.isArray(value)) {
    for (const child of value) walkJsonLd(child, found);
  } else {
    for (const child of Object.values(value)) walkJsonLd(child, found);
  }
}

function extractJsonLd(html) {
  const found = {};
  const scriptPattern =
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;

  while ((match = scriptPattern.exec(html)) !== null) {
    try {
      walkJsonLd(JSON.parse(match[1].trim()), found);
    } catch {
      // 비표준 JSON-LD는 무시합니다.
    }
  }

  return found;
}

function extractArticleDetails(html) {
  const jsonLd = extractJsonLd(html);

  const title = cleanTitle(
    getMetaContent(html, ["og:title", "twitter:title", "headline"]) ||
      jsonLd.headline ||
      (html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? "")
  );

  const rawDate =
    getMetaContent(html, [
      "article:published_time",
      "datepublished",
      "date",
      "dcterms.date",
      "parsely-pub-date",
    ]) ||
    jsonLd.datePublished ||
    (() => {
      const timeTag = html.match(/<time\b[^>]*>/i)?.[0] ?? "";
      return parseAttributes(timeTag).datetime || "";
    })();

  const summary = cleanSummary(
    getMetaContent(html, ["og:description", "description"]) ||
      jsonLd.description ||
      ""
  );

  return {
    title,
    publishedAt: parsePublishedDate(rawDate),
    summary,
  };
}

async function fetchText(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: REQUEST_HEADERS,
      redirect: "follow",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${url}`);
    }

    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

async function mapWithLimit(items, limit, worker) {
  const output = new Array(items.length);
  let cursor = 0;

  async function run() {
    while (cursor < items.length) {
      const index = cursor++;
      try {
        output[index] = await worker(items[index], index);
      } catch (error) {
        output[index] = {
          ...items[index],
          detailError:
            error instanceof Error ? error.message : String(error),
        };
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => run())
  );
  return output;
}

async function enrichArticles(articles) {
  const targets = articles.slice(0, ENRICH_LIMIT);
  const rest = articles.slice(ENRICH_LIMIT);

  const enriched = await mapWithLimit(targets, 4, async (article) => {
    if (
      article.publishedAt &&
      article.summary &&
      article.title.length >= 8
    ) {
      return article;
    }

    const html = await fetchText(article.url);
    const detail = extractArticleDetails(html);

    return {
      ...article,
      title: detail.title || article.title,
      publishedAt: detail.publishedAt || article.publishedAt,
      summary: detail.summary || article.summary,
    };
  });

  return [...enriched, ...rest];
}

function selectArticles(articles) {
  const targetDate = getDateKey(new Date());
  const unique = [
    ...new Map(articles.map((article) => [article.url, article])).values(),
  ];

  unique.sort((left, right) => {
    if (left.publishedAt && right.publishedAt) {
      return new Date(right.publishedAt) - new Date(left.publishedAt);
    }
    if (left.publishedAt) return -1;
    if (right.publishedAt) return 1;
    return left.sourceOrder - right.sourceOrder;
  });

  const todayArticles = unique.filter(
    (article) =>
      article.publishedAt &&
      getDateKey(article.publishedAt) === targetDate
  );
  const recentArticles = unique.filter(
    (article) =>
      !article.publishedAt ||
      getDateKey(article.publishedAt) !== targetDate
  );

  const selected = todayArticles.slice(0, MAX_ARTICLES);
  if (selected.length < MAX_ARTICLES) {
    selected.push(
      ...recentArticles.slice(0, MAX_ARTICLES - selected.length)
    );
  }

  return {
    targetDate,
    todayCount: todayArticles.length,
    selected: selected.map((article) => ({
      title: article.title,
      url: article.url,
      publishedAt: article.publishedAt || null,
      summary: article.summary || "",
      isToday:
        Boolean(article.publishedAt) &&
        getDateKey(article.publishedAt) === targetDate,
    })),
  };
}

async function readPreviousPayload() {
  try {
    return JSON.parse(await fs.readFile(OUTPUT_PATH, "utf8"));
  } catch {
    return null;
  }
}

async function writePayload(payload) {
  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await fs.writeFile(
    OUTPUT_PATH,
    `${JSON.stringify(payload, null, 2)}\n`,
    "utf8"
  );
}

async function run() {
  const previous = await readPreviousPayload();

  try {
    console.log(`축구 기사 목록 요청: ${SOURCE_URL}`);
    const categoryHtml = await fetchText(SOURCE_URL);
    const extracted = extractArticleLinks(categoryHtml);

    if (extracted.length === 0) {
      throw new Error(
        "중앙일보 페이지에서 기사 링크를 찾지 못했습니다."
      );
    }

    console.log(`목록에서 ${extracted.length}건 발견`);
    const enriched = await enrichArticles(extracted);
    const result = selectArticles(enriched);

    if (result.selected.length === 0) {
      throw new Error("표시할 축구 기사를 선별하지 못했습니다.");
    }

    const payload = {
      status: "ok",
      message:
        result.todayCount < MAX_ARTICLES
          ? `오늘 등록된 기사가 ${result.todayCount}건이라 부족한 수는 최근 기사로 채웠습니다.`
          : "",
      source: {
        name: "중앙일보",
        section: "축구",
        url: SOURCE_URL,
      },
      timezone: TIME_ZONE,
      updatedAt: new Date().toISOString(),
      targetDate: result.targetDate,
      todayCount: result.todayCount,
      articleCount: result.selected.length,
      usedRecentFallback: result.todayCount < MAX_ARTICLES,
      articles: result.selected,
    };

    await writePayload(payload);
    console.log(`${OUTPUT_PATH}에 ${payload.articleCount}건 저장 완료`);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error);
    console.error("기사 갱신 실패:", message);

    if (previous?.articles?.length) {
      await writePayload({
        ...previous,
        status: "stale",
        message:
          `새 기사 수집에 실패해 이전 데이터를 표시합니다. (${message})`,
        lastAttemptAt: new Date().toISOString(),
      });
      console.log("이전에 저장된 기사 데이터를 유지했습니다.");
      return;
    }

    await writePayload({
      status: "error",
      message: `기사 수집에 실패했습니다. (${message})`,
      source: {
        name: "중앙일보",
        section: "축구",
        url: SOURCE_URL,
      },
      timezone: TIME_ZONE,
      updatedAt: new Date().toISOString(),
      targetDate: getDateKey(new Date()),
      todayCount: 0,
      articleCount: 0,
      usedRecentFallback: false,
      articles: [],
    });

    process.exitCode = 1;
  }
}

await run();
