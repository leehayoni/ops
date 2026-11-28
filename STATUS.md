# 서비스 운영 상태

점검 시각: 2026-11-28T07:49:44.592Z (UTC)

| 서비스 | 상태 | 페이지 | API | 리포 (최근 커밋 · 열린 신고) |
|---|---|---|---|---|
| [부모님 돌봄지도](https://dolbom-map-beta.vercel.app) | 🟢 정상 | / 200 (191ms) | - | leehayoni/dolbom-map · 2026-11-20 · 1건 |
| [메뉴사진 수선](https://menu-photo-shop.arkly-onoff.workers.dev) | ⚫ 접음 | - | - | - |
| [지게차런](https://forklift-run.vercel.app) | 🟢 정상 | / 200 (116ms) | 커피 버튼 200<br>기록판 200 | leehayoni/forklift-run · 2026-11-28 · 1건 |
| [김장 셈법](https://kimjang-zeta.vercel.app) | 🟡 주의 | / 200 (191ms) | - | - |
| [Goleu (스택 추천 + LLM 비용 계산기)](https://goleu.vercel.app) | 🟡 주의 | / 200 (153ms)<br>/build 200 (145ms)<br>/llm-cost 200 (91ms) | 스택 추천 API 200 | arklyonoff-code/Goleu-AI · 2026-11-27 · 0건 |
| [물길 원정대](https://mulgil-nu.vercel.app) | 🟡 주의 | / 200 (212ms) | - | leehayoni/mulgil-quest · 2026-11-26 · 0건 |

## 발견 사항

- ⚪ **지게차런** — CrazyGames 심사 중 (1일째)
- 🟡 **김장 셈법** — Vercel Web Analytics가 꺼져 있음 (스크립트 404) → 방문자 수가 0으로 쌓이는 중
- 🟡 **김장 셈법** — 링크 미리보기 이미지(og:image)가 없음 → 카톡·Threads에 공유하면 글자만 보임
- ⚪ **김장 셈법** — GitHub 리포 없음 → 코드 백업·피드백 이슈 수집이 안 됨
- ⚪ **Goleu (스택 추천 + LLM 비용 계산기)** — Google Search Console 등록 여부가 services.json에 기록돼 있지 않음
- 🟡 **Goleu (스택 추천 + LLM 비용 계산기)** — Vercel Hobby(비상업 전용)에서 수익 모델 'affiliate' 운영 중 → 프로젝트 정지 위험
- 🟡 **물길 원정대** — Vercel Web Analytics가 꺼져 있음 (스크립트 404) → 방문자 수가 0으로 쌓이는 중
