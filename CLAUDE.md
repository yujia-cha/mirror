# CLAUDE.md

림버스 컴퍼니 **거울 던전** 루트 플래너. 사용자가 덱(인격 12인)과 원하는 E.G.O 기프트를 고르면, 그 기프트를 모으기 위한 층별 테마팩 루트를 계산해 보여주는 정적 웹앱이다. 백엔드는 없고 GitHub Pages로 배포한다.

비상업 팬 프로젝트다. 게임 데이터와 텍스트의 권리는 Project Moon에 있다.

## 명령어

```bash
npm run dev            # 개발 서버
npm run build          # 타입 검사 + 프로덕션 빌드
npm test               # 단위 테스트
npm run check          # lint + typecheck + test + data:validate  ← 커밋 전 필수
npm run data:fetch     # 원본 게임 데이터 내려받기 (sources.lock.json 기준)
npm run data:build     # data/raw + data/curated → public/data
npm run data:validate  # 스키마 · 참조 무결성 · 도메인 불변식 검사
npm run data:diff      # 이전 커밋 대비 데이터 변경 요약
npm run data:changelog # 갱신 내역을 docs/research/changelog.md에 한 줄 추가
npm run route -- --deck 10101,... --want 9088,... --floors 1-5 --difficulty hard
```

## 디렉터리 규칙

| 경로 | 성격 | 규칙 |
|---|---|---|
| `data/raw/**` | vendoring된 게임 원본 | 손으로 고치지 않는다. `data:fetch`가 덮어쓴다 |
| `data/curated/**` | 사람이 적는 보정·상수 | 모든 항목에 `_source` 근거를 남긴다 |
| `public/data/**` | 생성물 (커밋 대상) | 손으로 고치지 않는다. `data:build`로만 만든다 |
| `src/core/**` | 순수 TS 로직 | React·DOM·fetch 금지(ESLint가 막는다). 결정적이어야 한다 |
| `src/app/**` | React UI | 계획 로직을 재구현하지 않고 `planRoute()`를 호출한다 |
| `scripts/**` | tsx로 실행하는 파이프라인 | 출력은 항상 결정적(정렬·고정 키 순서) |

## 도메인 규칙 (자세한 내용은 `md-domain` 스킬)

- 현재 시즌은 거울 던전 7 「이름과 거미의 거울」.
- 층: Normal/Hard 1~5, 평행중첩 6~10(1~5층 전부 Hard 필요), EXTREME 11~15(관측 불가).
- **Hard는 sticky** — 한 번 고르면 Normal로 못 돌아간다.
- 팩의 층 제한은 `exceptionConditions[].selectableFloors`이고 **0-기준**이다. `dungeonIdx`는 0=Normal, 1=Hard, 2=평행중첩, 3=EXTREME.
- 기프트 획득은 범용 / 테마팩 한정 / 조합 전용 / 시작으로 나뉜다. **범용은 "나올 수 있음"이고 확정이 아니다** — UI와 결과 문구가 이 차이를 분명히 해야 한다.
- 조건부 기프트의 키워드 조건은 인격 태그가 아니라 **해당 키워드를 부여하는 공격 스킬 보유 수**로 센다. 소속 조건은 `associationList`로 센다.

## 코드 규칙

- 게임 상수는 코드에 박지 않고 `data/curated/rules.json`에 둔다.
- 스키마는 `src/core/schema.ts`(Zod) 한 곳에서 정의하고 파이프라인·앱·테스트가 공유한다.
- UI 문자열은 `src/app/i18n/`에 두고 **한국어 우선**, 영어는 보조로 병기한다.
- 정적 파일 참조는 항상 `import.meta.env.BASE_URL`을 붙인다(Pages의 하위 경로 때문).
- 계획이 불가능한 요구는 조용히 버리지 않고 `unresolved`에 이유와 함께 남긴다.

## 에이전트와 스킬

작업 성격에 맞는 서브에이전트를 쓴다: `game-data-researcher`(규칙·데이터 출처 조사), `data-pipeline-engineer`(scripts·data), `route-algorithm-engineer`(src/core), `frontend-engineer`(src/app), `qa-reviewer`(푸시 전 리뷰).

게임 데이터나 루트 로직을 건드리기 전에 `md-domain` 스킬을 읽는다. 데이터 갱신은 `update-game-data`, 검증 실패는 `validate-data`, 보정 추가는 `add-curated-override`, 루트가 이상할 때는 `route-debug`, 배포는 `deploy-pages`.

## 커밋

- 커밋 전 `npm run check`. 훅이 `git commit`/`git push`를 가로채 같은 검사를 돌린다.
- `public/data`가 바뀌면 생성물도 같은 커밋에 포함한다(CI가 재현성을 검사한다).
- 마일스톤 단위로 커밋하고 `docs/review/M{n}.md`에 리뷰용 요약을 남긴다.
