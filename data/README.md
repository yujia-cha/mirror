# data/

## 디렉터리

| 경로 | 성격 | 편집 |
|---|---|---|
| `sources.lock.json` | 원본 저장소와 커밋 sha, 받아올 파일 목록 | `npm run data:fetch -- --update`로 갱신 |
| `raw/` | vendoring된 게임 원본 JSON (커밋 대상) | **손대지 않는다.** `data:fetch`가 덮어쓴다 |
| `curated/` | 정적 데이터가 표현하지 못하는 사실 (커밋 대상) | 사람이 편집. 모든 항목에 `_source` 근거 |
| `fixtures/` | 테스트용 축소 데이터 | `npm run data:fixtures`로 생성 |

생성물인 `public/data/`는 저장소 루트에 있다(앱이 fetch하는 경로라서).

## 흐름

```
data/raw  ─┐
           ├─ scripts/build-data.ts ─→ public/data/*.json ─→ 앱 · 플래너
data/curated ┘                              │
                                  scripts/validate-data.ts
```

## 출처와 라이선스

- 게임 정적 데이터: [LEAGUE-OF-NINE/OpenLethe](https://github.com/LEAGUE-OF-NINE/OpenLethe)에 미러된 Limbus Company 클라이언트 데이터.
- 이름·효과 텍스트: [LocalizeLimbusCompany](https://github.com/LocalizeLimbusCompany/LocalizeLimbusCompany) (번역 팩은 CC BY-NC-SA 4.0).

**게임 데이터와 텍스트의 권리는 Project Moon에 있다.** 이 저장소는 비상업 팬 프로젝트이고, 데이터는 플래너 동작에 필요한 범위에서만 재배포한다. 자세한 내용은 `docs/research/data-sources.md`.

## 갱신

`update-game-data` 스킬의 런북을 따른다. 요약:

```bash
npm run data:fetch -- --update
npm run data:build
npm run data:validate
npm run data:diff
```
