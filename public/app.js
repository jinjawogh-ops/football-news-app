const DATA_URL = "./data/articles.json";
const READ_STORAGE_KEY = "joongang-football-read-v1";

const elements = {
  updatedAt: document.querySelector("#updatedAt"),
  todayCount: document.querySelector("#todayCount"),
  articleCount: document.querySelector("#articleCount"),
  dateLabel: document.querySelector("#dateLabel"),
  dataNotice: document.querySelector("#dataNotice"),
  articleList: document.querySelector("#articleList"),
  messageBox: document.querySelector("#messageBox"),
  articleTemplate: document.querySelector("#articleTemplate"),
  refreshButton: document.querySelector("#refreshButton"),
  resetReadButton: document.querySelector("#resetReadButton"),
  installButton: document.querySelector("#installButton"),
};

let deferredInstallPrompt = null;

function getReadUrls() {
  try {
    const parsed = JSON.parse(localStorage.getItem(READ_STORAGE_KEY) || "[]");
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function saveReadUrls(readUrls) {
  localStorage.setItem(READ_STORAGE_KEY, JSON.stringify([...readUrls]));
}

function formatDateTime(iso) {
  if (!iso) return "미확인";

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "미확인";

  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function formatFullDate(dateKey) {
  if (!dateKey) return "오늘의 기사";

  const date = new Date(`${dateKey}T00:00:00+09:00`);
  if (Number.isNaN(date.getTime())) return "오늘의 기사";

  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(date);
}

function showMessage(message, type = "notice") {
  if (!message) {
    elements.messageBox.className = "message-box is-hidden";
    elements.messageBox.textContent = "";
    return;
  }

  elements.messageBox.className =
    type === "error" ? "message-box is-error" : "message-box";
  elements.messageBox.textContent = message;
}

function renderEmpty(message) {
  elements.articleList.innerHTML = "";
  const empty = document.createElement("div");
  empty.className = "empty-card";
  empty.textContent = message;
  elements.articleList.append(empty);
}

function renderArticles(payload) {
  const articles = Array.isArray(payload.articles) ? payload.articles : [];
  const readUrls = getReadUrls();

  elements.updatedAt.textContent = formatDateTime(payload.updatedAt);
  elements.todayCount.textContent = `${payload.todayCount ?? 0}건`;
  elements.articleCount.textContent = `${articles.length}건`;
  elements.dateLabel.textContent = formatFullDate(payload.targetDate);

  if (payload.usedRecentFallback) {
    elements.dataNotice.textContent =
      `오늘 기사 ${payload.todayCount ?? 0}건 · 부족한 수는 최근 기사로 보충`;
  } else {
    elements.dataNotice.textContent = `오늘 등록된 기사 ${articles.length}건`;
  }

  if (payload.status === "stale") {
    showMessage(
      payload.message ||
        "새 데이터 수집에 실패해 마지막으로 저장된 기사를 표시하고 있습니다."
    );
  } else if (payload.status === "error") {
    showMessage(
      payload.message || "기사 데이터를 가져오지 못했습니다.",
      "error"
    );
  } else if (payload.message) {
    showMessage(payload.message);
  } else {
    showMessage("");
  }

  if (articles.length === 0) {
    renderEmpty("표시할 기사가 없습니다. 잠시 뒤 새로고침해 주세요.");
    return;
  }

  elements.articleList.innerHTML = "";

  articles.forEach((article, index) => {
    const fragment = elements.articleTemplate.content.cloneNode(true);
    const card = fragment.querySelector(".article-card");
    const link = fragment.querySelector(".article-card__link");
    const badge = fragment.querySelector(".article-card__badge");
    const summary = fragment.querySelector(".article-card__summary");

    fragment.querySelector(".article-card__number").textContent =
      String(index + 1).padStart(2, "0");
    fragment.querySelector(".article-card__title").textContent =
      article.title || "제목 없음";
    fragment.querySelector(".article-card__time").textContent =
      article.publishedAt
        ? formatDateTime(article.publishedAt)
        : "발행시각 미확인";

    summary.textContent = article.summary || "";

    badge.textContent = article.isToday ? "오늘" : "최근";
    if (!article.isToday) badge.classList.add("is-recent");

    link.href = article.url;
    link.setAttribute(
      "aria-label",
      `${article.title || "축구 기사"} 원문 열기`
    );

    if (readUrls.has(article.url)) {
      card.classList.add("is-read");
    }

    link.addEventListener("click", () => {
      const nextReadUrls = getReadUrls();
      nextReadUrls.add(article.url);
      saveReadUrls(nextReadUrls);
      card.classList.add("is-read");
    });

    elements.articleList.append(fragment);
  });
}

async function loadArticles() {
  elements.refreshButton.disabled = true;
  elements.refreshButton.lastElementChild?.classList?.add("is-spinning");

  try {
    const response = await fetch(`${DATA_URL}?v=${Date.now()}`, {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`데이터 요청 실패: HTTP ${response.status}`);
    }

    const payload = await response.json();
    renderArticles(payload);
  } catch (error) {
    console.error(error);
    elements.updatedAt.textContent = "불러오기 실패";
    elements.todayCount.textContent = "-";
    elements.articleCount.textContent = "-";
    elements.dataNotice.textContent = "네트워크 연결을 확인해 주세요.";
    showMessage(
      "기사 데이터를 불러오지 못했습니다. 인터넷 연결 후 새로고침해 주세요.",
      "error"
    );
    renderEmpty("데이터를 표시할 수 없습니다.");
  } finally {
    elements.refreshButton.disabled = false;
  }
}

elements.refreshButton.addEventListener("click", loadArticles);

elements.resetReadButton.addEventListener("click", () => {
  localStorage.removeItem(READ_STORAGE_KEY);
  document
    .querySelectorAll(".article-card.is-read")
    .forEach((card) => card.classList.remove("is-read"));
});

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  elements.installButton.classList.remove("is-hidden");
});

elements.installButton.addEventListener("click", async () => {
  if (!deferredInstallPrompt) return;

  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  elements.installButton.classList.add("is-hidden");
});

window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
  elements.installButton.classList.add("is-hidden");
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((error) => {
      console.warn("서비스 워커 등록 실패:", error);
    });
  });
}

loadArticles();
