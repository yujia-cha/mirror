# 데이터 출처와 갱신 경로

## 쓰는 것

**출처가 살아 있는지를 먼저 본다.** 이 프로젝트가 겪은 문제는 전부 「출처가 조용히 멈췄다」였다.

| 출처 | 가져오는 것 | 갱신 상태 |
|---|---|---|
| [`x1bViolet/Limbus-Localization-Files`](https://github.com/x1bViolet/Limbus-Localization-Files) 브랜치 `Korean`·`English` | 공식 로컬라이제이션 JSON. 이름·효과 텍스트와 **인격 스킬 원문** | ✅ **주 1회, 게임 패치 당일** |
| [`eldritchtools/limbus-assets`](https://github.com/eldritchtools/limbus-assets) `data/identities.json` | 파생 인격 데이터(영문). 공격 스킬 목록·죄악·공격 유형·등급·소속 태그 | ✅ **거의 매일** (`meta.json`에 갱신 시각) |
| [`LEAGUE-OF-NINE/OpenLethe`](https://github.com/LEAGUE-OF-NINE/OpenLethe) `…/static-data/**` | 테마팩·기프트·조합·던전 구성·인격·스킬 (원본 스키마) | ⚠️ **얼어붙음** — `static-data`는 2026-07-25 「init」 커밋 하나뿐인 일회성 캡처 |

라이선스: 셋 다 게임 추출물이고 권리는 Project Moon에 있다. x1bViolet·eldritchtools는 라이선스 파일이 없다.

세 출처 모두 `data/sources.lock.json`에 **커밋 sha로 고정**하고 받아온 파일을 `data/raw/`에 커밋한다. 언제든 사라질 수 있으므로 스냅샷 보관이 전제다.

### 인격은 세 층으로 만든다

정적 데이터 > 자동 백필 > 수기. 각 층은 위층에 없는 것만 채우고, 아래층이 위층을 가리면 `data:build`가 멈춘다.

1. **정적 데이터**(OpenLethe) — 있으면 무조건 이것을 쓴다
2. **자동 백필** — 정적에 없는 인격을 eldritchtools(공격 스킬 목록·죄악·공격 유형·등급·소속) + KR 스킬 원문(키워드)으로 조립한다. `scripts/lib/derived-source.ts`, `scripts/lib/derive-text.ts`
3. **수기** — 셋 다 없을 때만. `data/curated/identities.json` (`add-curated-override` 스킬 6번)

키워드만은 **KR 원문에서 도출한 값**을 쓴다. eldritchtools의 `skillKeywordList`는 179명 중 10명에서 우리 정적 도출보다 **덜** 알기 때문에 진실이 아니라 교차검증용이다.

### 왜 바꿨나 (2026-09-15)

`LocalizeLimbusCompany`는 「Auto RAW Update」가 1~2주마다 돌던 좋은 출처였는데 **2026-07-23 이후 멈췄다**. OpenLethe의 `static-data`는 애초에 갱신 루프가 없는 일회성 캡처다. 그래서 10116 「차원찢개」는 현지화에만 있었고, 10616 「동부 섕크 협회 3과」는 **양쪽 모두에 없어** 검증조차 못 잡았다.

> ⚠️ **남은 노출**: OpenLethe가 얼어 있으므로 **거울 던전 8이 오면 인격이 아니라 앱 전체가 멈춘다**(팩·기프트·층·조합이 전부 거기서 온다). eldritchtools에 `md_theme_packs.json`·`md_floor_packs.json`·`gifts.json`이 있어 옮길 길은 있다. 시즌이 바뀌기 전에 손봐야 한다.

### 공식 경로는 없다

Project Moon CDN(`limbuscompanycdn.org`)은 **게임 설치본에서 뽑은 빌드별 토큰**이 있어야 하고, 거기 있는 것은 현지화뿐이다(StaticData는 클라이언트 번들 안). 게임 서버 API에도 데이터 엔드포인트가 없다. 공개된 무인증 경로는 존재하지 않으므로 실용적인 길은 추출물 미러뿐이다. 아래 「클라이언트에서 직접 추출」이 최후의 수단이다.

## 참고만 한 것 (데이터를 가져오지 않음)

| 출처 | 왜 참고했나 | 왜 쓰지 않나 |
|---|---|---|
| [`Girey0211/Guida`](https://github.com/Girey0211/Guida) (MIT) | 같은 문제를 푸는 한국어 프로젝트. 필드 설계(팩 층 목록, 기프트 획득 분류)와 인격 키워드 교차 검증에 썼다 | 수작업 데이터라 갱신이 느리고 id가 이름 기반이다. 재배포하지 않는다 |
| [`phrimm136/dante-planner`](https://github.com/phrimm136/dante-planner) (AGPL-3.0) | `dungeonIdx`·`selectableFloors` 의미 교차 확인 | AGPL이라 코드를 복사하지 않는다 |
| [`SyxP/ObiterDicta.jl`](https://github.com/SyxP/ObiterDicta.jl) (MIT) | 정적 데이터 필드명과 클라이언트 추출 절차 | 데이터 스냅샷이 거울 던전 4 시절이라 오래됐다 |
| 나무위키 `Limbus Company/거울 던전/**` | 기프트 해설, 전용 기프트 표, 커뮤니티 통칭 | 기계 판독용이 아니고 세션 환경에서 접근이 차단된다. 큐레이션 근거로만 인용한다 |

## 원본이 사라졌을 때의 대안: 클라이언트에서 직접 추출

ObiterDicta가 쓰는 경로를 그대로 따를 수 있다. PC에 게임이 설치되어 있어야 한다.

1. `catalog_S1.json`을 찾는다: `%USERPROFILE%\AppData\LocalLow\ProjectMoon\LimbusCompany\**`. 또는 CDN에서 버전을 알고 받는다 — `https://d7g8h56xas73g.cloudfront.net/<catalogVersion>/catalog_S1.json`.
2. 카탈로그의 `m_InternalIds`에서 `https`로 시작하고 경로에 `localize` 또는 `static`이 포함된 번들 URL만 골라 받는다(요청 간 0.2초 정도 간격).
3. [UnityPy](https://github.com/K0lb3/UnityPy)로 번들을 열어 `TextAsset`의 `m_Script`를 JSON 파일로 쓴다. 번들 이름이 언어를 알려준다.
4. 결과를 `data/raw/static/`, `data/raw/localize/{KR,EN}/`에 배치하고 `npm run data:build`.

이 경로는 게임 약관상 민감할 수 있으니 개인 확인용으로만 쓰고, 추출물을 재배포하지 않는다.

## 필요한 파일 목록

`data/sources.lock.json`이 정답이지만, 빠진 것을 찾을 때의 참고:

**OpenLethe (static-data)**
- `mirrordungeon-theme-floor/mirrordungeon-theme-floor-t{1..6}.json`
- `ego-gift-mirrordungeon/*.json`
- `mirror-dungeon-common-data/mirror-dungeon-common-data-md7.json`
- `mirrordungeon-egogift-droppool/mirrordungeon-egogift-droppool-7.json`
- `mirrordungeon/mirrordungeon-07{,-hard,-infinite,-extreme}.json`
- `mirrordungeon-start-buffs/mirrordungeon-start-buffs-07.json`
- `personality/personality-{01..12}.json`
- `skill/personality-skill-{01..12}.json`

**로컬라이제이션 (KR/ 및 EN/) — x1bViolet의 `Korean`·`English` 브랜치**
- `EGOgift_MirrorDungeon{,_2,_6,_7}.json` — 시즌이 바뀌면 `_8` 등이 생긴다
- `EGOgift_MirrorDungeon{-StoryTheme,-StoryTheme_2,-EventTheme,-EventTheme_2,-mowe,-mowe-re,-ycgd}.json`
- `EGOgift_{TwiningThreads,cultivation,pilgrimage,lcbcheckup-re,night-clean-up-re,tktRe,walpu4,walpu6,walpu8,a1c8p2}.json`
- `MirrorDungeonTheme-1.json`, `Personalities.json`, `UnitKeyword.json`, `EgoGiftCategory.json`, `BattleKeywords.json`, `MirrorDungeonEgoGiftLockedDesc.json`, `DungeonStartBuffs_MD7.json`, `MirrorDungeonUI_7.json`, `TutorialMirrorDungeon.json`
- **`Skills_personality-{01..12}.json` — KR만** (`files[]` 항목에 `{ "path": …, "languages": ["KR"] }`로 언어를 좁힌다). 앱은 스킬 텍스트를 렌더하지 않는다. 이것을 vendoring하는 이유는 하나다: **정적 데이터에 없는 인격의 키워드를 공식 문장에서 도출하는 근거**(`scripts/lib/derive-text.ts`, 지금은 10116 하나). 영어본은 같은 크기인데 도출에 쓰이지 않아 받지 않는다 — 부여를 나타내는 문법(「… 부여」·「… 증가」)이 한국어다.
  - **커버리지가 부분적이다**: 12개 파일이 183명 중 121명만 덮는다(각 죄인의 가장 오래된 인격들은 스킬 텍스트가 미러 어디에도 없다). `tests/text-derivation.test.ts`가 이 수를 그대로 단언한다.
  - 현지화 저장소에는 매니페스트가 없고 GitHub API가 샌드박스에서 막히는 경우가 많아, 파일이 사라지면 `data:fetch`의 404 보고가 유일한 신호다.

## 서버 재구현 코드 (규칙 확인용)

OpenLethe의 C# 포트는 규칙을 읽는 데 유용하다. 복사하지는 않는다.

| 파일 | 알 수 있는 것 |
|---|---|
| `MdTheme.cs` | 정적 데이터 필드 구조(`ThemeStatic`, `ExceptionCondition`) |
| `MdMapGen.cs` | 층→dungeonIdx 매핑(`act = floor / 5 + 1`), 팩 제시 수 |
| `MirrorDungeon/Data/MdThemePool.cs` | 상점 기프트 풀 계산(전용 기프트 제외 후 현재 팩 전용만 재삽입, 조합 결과물 제외) |
| `MdEgoFusion.cs` | 고정 레시피 해시 조회 방식, 재료 순서 무관 |
