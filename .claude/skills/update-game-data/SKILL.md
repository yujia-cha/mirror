---
name: update-game-data
description: Refresh the vendored Limbus Company game data after a patch or a new Mirror Dungeon season, then regenerate and verify public/data. Use when the game updated, when a new pack or gift is missing from the app, or when someone asks to update the data.
---

# 게임 데이터 갱신 런북

매월 1일 `.github/workflows/data-update.yml`이 이 런북의 1·2·5절을 자동으로 돌린다. 변경이 있으면 `data/auto-update-<dataVersion>` 브랜치에 드래프트 PR을 연다. 아래는 손으로 돌릴 때(패치 직후 등)의 절차이고, 자동 PR을 리뷰할 때 확인할 내용도 같다.

## 1. 원본 갱신

```bash
npm run data:fetch -- --update      # sources.lock.json의 sha를 최신 main으로 올리고 data/raw 재다운로드
git --no-pager diff --stat data/sources.lock.json data/raw
```

`--update` 없이 실행하면 lock에 적힌 sha 그대로 내려받는다(재현용). 네트워크가 막힌 환경이면 `data/raw`가 이미 커밋되어 있으므로 이 단계를 건너뛰어도 빌드는 된다.

## 2. 재생성과 검증

```bash
npm run data:build
npm run data:validate
npm run data:diff                   # 이전 커밋 대비 추가/삭제/변경된 id 요약
npm test
```

## 3. 시즌이 바뀐 경우 (거울 던전 8 등)

OpenLethe의 거울 던전 캡처는 **얼어 있어 새 시즌이 오지 않는다**. 순서대로 한다.

1. `npm run data:fetch -- --update && npm run data:build` — 파생 미러(eldritchtools)가 먼저 움직인다. 새 팩·기프트가 있으면 **폴백이 자동으로 합성**하고 빌드가 몇 개를 백필했는지 찍는다.
2. `npm run data:validate`를 읽는다.
   - 「packs the derived source knows and we do not ship」 **경고** → 새 시즌이 시작됐다는 첫 신호
   - 「backfilled from the derived source and have no general gift pool」 **에러** → 폴백은 팩별 **범용 기프트 풀**을 못 준다. 여기서 멈춘다
3. 그 에러를 풀려면 원본이 필요하다. 게임이 설치된 PC에서 추출해(`docs/research/data-sources.md`의 「클라이언트에서 직접 추출」) 넣는다:
   ```bash
   npm run data:import -- <추출한 static-data 폴더>          # 미리보기
   npm run data:import -- <추출한 static-data 폴더> --write   # 적용
   ```
   새 시즌 파일명(`mirror-dungeon-common-data-md8.json` 등)은 스크립트가 찾아 알려 준다. **`sources.lock.json`에 손으로 더한다** — 스크립트는 lock을 고치지 않는다.
4. 추출이 불가능하면 그 시즌은 **팩 한정·조합·시작 기프트까지만** 계획할 수 있다. 그 상태로 배포하려면 `data/curated/seasons/md{n}/rules.json`에 적는다:
   ```json
   {
     "provisional": true,
     "floors": { "normal": [1,2,3,4,5], "hard": [1,2,3,4,5], "parallel": [], "extreme": [] },
     "_floors_source": "인게임 확인 — 시즌 초기에는 1~5층만 열린다"
   }
   ```
   `provisional`은 범용 풀 없음을 **에러에서 경고로** 낮춘다. 그래야 새 시즌이 **지난 시즌 빌드를 막지 않는다**. 반쪽인 시즌은 `index.json`의 기본이 되지 않고(데이터가 온전한 가장 새 시즌이 기본이다), 앱 푸터가 「데이터 일부 미확인」이라고 말한다. 원본을 넣어 범용 풀이 채워지면 `provisional`을 지운다 — 그 순간 자동으로 기본 시즌이 된다.

### 시즌 생성물의 모양

- 생성물은 시즌별 `public/data/md{n}/{meta,rules,gifts,packs}.json`과 공용 `public/data/{enums,identities,index}.json`으로 갈린다.
- **한 번에 한 시즌만 굽는다.** `data/raw/static`은 한 시즌의 스냅숏이므로, md8 스냅숏이 들어오면 **md7은 다시 구울 수 없다** — md7 디렉터리는 커밋된 채로 얼려 두고 건드리지 않는다. 다시 구워야 하면 그 시즌을 구웠던 커밋을 체크아웃한다.
- `index.json`은 디렉터리를 훑어 매 빌드마다 다시 쓴다. 지난 시즌을 지우면 목록에서도 사라진다.
- 층 범위는 `rules.floors`가 유일한 출처다. 시즌 파일에 없으면 1~5 / 6~10 / 11~15가 기본.
- `npm run data:build -- --season 7`로 스냅숏이 아직 가진 시즌을 골라 구울 수 있다.

새 시즌은 `data/curated/rules.json`의 상수(별빛·조합 확률·관측 비용·강화 비용)도 바뀔 수 있다. 파생 미러에는 없으므로 인게임 확인 후 `_source`와 함께 적는다.

## 4. 검증이 실패할 때

`npm run data:validate`가 불변식 위반을 보고하면 **게임이 바뀐 것인지 파이프라인이 깨진 것인지** 먼저 판단한다.

- 팩 수·기프트 수가 늘었을 뿐이면 `scripts/validate-data.ts`의 기대 하한을 올리고, 커밋 메시지에 "MD8에서 팩 N개 추가" 같은 근거를 남긴다.
- 범용 기프트 집합이 EXTREME 팩 풀과 더 이상 일치하지 않으면 파생 규칙이 깨졌을 가능성이 높다. `validate-data`의 경고만 보고 넘기지 말고 `docs/research/mechanics.md`를 다시 확인한다.
- 조건 파서 스냅샷이 바뀌면 `npx vitest run scripts -u` 전에 **변경된 문장을 눈으로 읽는다**. 새 문형이 생겼다면 파서에 패턴을 추가하는 것이 맞다.
- 「known upstream but not shipped」 **에러**는 어떤 출처든 아는 인격을 우리가 안 내보낸다는 뜻이다. 괄호 안에 어느 출처가 아는지 적혀 있다. 순서: ① `npm run data:fetch -- --update` ② 다시 빌드 ③ 그래도 남으면 `add-curated-override` 6번을 따라 수기로 적는다.
- 「the derived source upstream is N days newer」 **경고**는 vendoring된 복사본이 낡았다는 뜻이다. `data:fetch -- --update`를 돌린다.
- 「disagree with the derived source on keywords」 **경고**는 우리 도출과 파생 미러가 어긋난 인격 수가 예산을 넘었다는 뜻이다. 보통 도출이 깨진 신호이므로 `tests/text-derivation.test.ts`부터 본다.
- 반대로 출처가 백필해 둔 인격을 내보내기 시작하면 `data:build`가 「now has static data upstream」 또는 「now covered by the derived source」로 멈춘다. 그 항목을 지우면 된다 — 진짜 데이터가 손으로 적은 값보다 낫다.

## 5. 마무리

- `public/data/md{n}/meta.json`의 `dataVersion`은 빌드가 자동으로 정한다(던전 id + 입력 전체의 해시). 입력이 그대로면 값도 그대로다.
- `npm run data:changelog` — `docs/research/changelog.md`에 한 줄 추가한다. **커밋 전에** 돌려야 한다(비교 대상이 git에 남아 있는 이전 `meta.json`이라서). 시즌/패치 같은 맥락은 그 줄에 손으로 덧붙인다.
- 커밋: `data: MD7 2026-09-04 패치 반영 (기프트 +6, 팩 +2)` 형태로 수치를 넣는다.

## 6. 자동 갱신 워크플로

`Update game data` (`.github/workflows/data-update.yml`), 매월 1일 18:00 UTC + 수동 실행.

- 원본 파일을 못 받으면(대개 시즌 교체로 이름이 바뀐 경우) **빌드하지 않고 멈춘다**. 3절대로 `sources.lock.json`을 고치는 건 사람 몫이다.
- 변경이 없으면 아무것도 열지 않는다.
- 브랜치 이름에 `dataVersion`이 들어가므로 내용이 다르면 브랜치도 다르다. force push를 하지 않는다.
- `GITHUB_TOKEN`이 연 PR에는 `ci.yml`이 붙지 않으므로, 워크플로가 `npm run check`를 직접 돌려 결과를 PR 본문에 적는다. 검사가 실패해도 PR은 열리고 잡이 빨갛게 끝난다 — diff는 사람이 봐야 하기 때문이다.
- 저장소 설정 **Settings → Actions → General → Workflow permissions**에서 "Allow GitHub Actions to create and approve pull requests"가 꺼져 있으면 PR 생성만 실패한다(브랜치 푸시는 성공). 그때는 푸시된 브랜치로 직접 PR을 열면 된다.
