# 오늘의 축구 5선 웹앱

중앙일보 축구 페이지의 최신 기사 5건을 **앱 화면에서 직접 확인**하는 설치형 웹앱(PWA)입니다.

텔레그램, 카카오톡, 별도 서버, API 키가 필요하지 않습니다.

## 작동 방식

1. GitHub Actions가 매일 한국시간 오전 9시에 실행됩니다.
2. 중앙일보 축구 페이지에서 최신 기사 정보를 수집합니다.
3. `public/data/articles.json`을 갱신합니다.
4. GitHub Pages에 웹앱을 다시 배포합니다.
5. 사용자는 휴대폰 홈 화면의 앱 아이콘을 눌러 기사 5건을 확인합니다.

오늘 등록된 기사가 5건 미만이면 최근 기사로 채우고 앱 화면에 이를 표시합니다.

## 제공 기능

- 최신 축구 기사 5건 카드 표시
- 발행시각과 간단한 기사 소개 표시
- 오늘 기사와 최근 보충 기사 구분
- 기사 클릭 시 중앙일보 원문 열기
- 읽은 기사 흐리게 표시
- 새로고침 버튼
- 오프라인일 때 마지막으로 불러온 데이터 표시
- Android/iPhone 홈 화면 설치 지원
- 매일 오전 9시 자동 갱신

## 1. GitHub에 올리기

1. 이 압축파일을 풉니다.
2. GitHub에서 새 저장소를 만듭니다.
3. 압축을 푼 폴더 안의 파일 전체를 저장소에 올립니다.
4. 저장소 기본 브랜치 이름을 `main`으로 사용합니다.

API 키나 GitHub Secret은 필요하지 않습니다.

## 2. GitHub Pages 켜기

GitHub 저장소에서 다음 순서로 이동합니다.

1. `Settings`
2. 왼쪽 메뉴 `Pages`
3. `Build and deployment`
4. `Source`를 **GitHub Actions**로 선택

그다음 저장소의 `Actions` 탭으로 이동합니다.

1. `축구 기사 앱 갱신 및 배포` 선택
2. `Run workflow`
3. 다시 `Run workflow`

초록색 체크가 뜨면 배포가 끝난 것입니다.

웹앱 주소는 일반적으로 다음 형식입니다.

```text
https://깃허브아이디.github.io/저장소이름/
```

정확한 주소는 `Settings → Pages`에서 확인할 수 있습니다.

## 3. 휴대폰에 앱처럼 설치하기

### Android Chrome

1. 배포된 웹앱 주소를 Chrome에서 엽니다.
2. 화면의 `앱 설치` 버튼을 누릅니다.
3. 버튼이 안 보이면 Chrome 메뉴 `⋮` → `앱 설치` 또는 `홈 화면에 추가`를 누릅니다.

### iPhone Safari

1. Safari에서 웹앱 주소를 엽니다.
2. 아래쪽 공유 버튼을 누릅니다.
3. `홈 화면에 추가`를 선택합니다.

설치 후 홈 화면의 **축구 5선** 아이콘으로 실행할 수 있습니다.

## 자동 갱신 시각

워크플로에는 다음 예약이 들어 있습니다.

```yaml
schedule:
  - cron: "0 0 * * *"
```

GitHub Actions 예약식은 UTC 기준이므로 `00:00 UTC`는 한국시간 `09:00`입니다.

GitHub 서버 상황에 따라 실제 갱신이 몇 분 늦어질 수 있습니다.

## 내 컴퓨터에서 미리 보기

웹브라우저에서 `index.html`을 직접 더블클릭하면 JSON 로딩과 PWA 기능이 제한될 수 있습니다.

VS Code에서 다음 방법을 권장합니다.

1. VS Code 확장 프로그램에서 `Live Server` 설치
2. `public/index.html` 우클릭
3. `Open with Live Server`

실제 기사 데이터를 내 컴퓨터에서 갱신하려면 Node.js 20 이상에서 실행합니다.

```bash
node scripts/fetch-news.mjs
```

## 폴더 구조

```text
joongang-football-news-app/
├─ .github/
│  └─ workflows/
│     └─ deploy.yml
├─ public/
│  ├─ data/
│  │  └─ articles.json
│  ├─ icons/
│  │  ├─ icon-192.png
│  │  └─ icon-512.png
│  ├─ app.js
│  ├─ index.html
│  ├─ manifest.webmanifest
│  ├─ styles.css
│  └─ sw.js
├─ scripts/
│  └─ fetch-news.mjs
├─ package.json
└─ README.md
```

## 참고 사항

- 브라우저가 중앙일보를 직접 호출하지 않습니다. GitHub Actions가 서버 측에서 수집하므로 일반적인 CORS 문제를 피합니다.
- 기사 본문이나 사진은 복제하지 않고 제목, 요약, 발행시각, 원문 링크만 사용합니다.
- 뉴스 사이트의 HTML 구조가 크게 바뀌면 수집 코드 수정이 필요할 수 있습니다.
- GitHub Actions 캐시에 마지막 성공 데이터를 보관합니다.
- 데이터 수집에 실패하면 직전 기사 데이터를 유지하고 앱 화면에 안내문을 표시합니다.
