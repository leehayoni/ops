# 서비스 운영 상태

점검 시각: 2026-11-24T03:06:29.493Z (UTC)

| 서비스 | 상태 | 페이지 | API | 리포 (최근 커밋 · 열린 신고) |
|---|---|---|---|---|
| [부모님 돌봄지도](https://dolbom-map-beta.vercel.app) | 🟡 주의 | / 200 (330ms) | - | - |
| [메뉴사진 수선](https://menu-photo-shop.arkly-onoff.workers.dev) | ⚫ 접음 | - | - | - |
| [지게차런](https://forklift-run.vercel.app) | 🟡 주의 | / 200 (120ms) | 커피 버튼 200<br>기록판 200 | - |
| [김장 셈법](https://kimjang-zeta.vercel.app) | 🟢 정상 | / 200 (173ms) | - | - |
| [Goleu (스택 추천 + LLM 비용 계산기)](https://goleu.vercel.app) | 🟡 주의 | / 200 (168ms)<br>/build 200 (38ms)<br>/llm-cost 200 (44ms) | 스택 추천 API 200 | arklyonoff-code/Goleu-AI · 2026-11-24 · 0건 |
| [물길 원정대](https://mulgil-nu.vercel.app) | 🟢 정상 | / 200 (63ms) | - | leehayoni/mulgil-quest · 2026-11-24 · 0건 |

## 발견 사항

- ⚪ **부모님 돌봄지도** — GA 미설정 (방문 수는 Vercel/Cloudflare Analytics로만 확인)
- 🟡 **부모님 돌봄지도** — 리포 leehayoni/dolbom-map 읽기 실패(404) → 비공개라면 ops Secrets에 LEEHAYONI_TOKEN 필요
- ⚪ **지게차런** — GA 미설정 (방문 수는 Vercel/Cloudflare Analytics로만 확인)
- 🟡 **지게차런** — 리포 leehayoni/forklift-run 읽기 실패(404) → 비공개라면 ops Secrets에 LEEHAYONI_TOKEN 필요
- ⚪ **김장 셈법** — GA 미설정 (방문 수는 Vercel/Cloudflare Analytics로만 확인)
- ⚪ **김장 셈법** — GitHub 리포 없음 → 코드 백업·피드백 이슈 수집이 안 됨
- 🟡 **Goleu (스택 추천 + LLM 비용 계산기)** — Vercel Hobby(비상업 전용)에서 수익 모델 'affiliate' 운영 중 → 프로젝트 정지 위험. Cloudflare Pages 이전 필요
- ⚪ **물길 원정대** — GA 미설정 (방문 수는 Vercel/Cloudflare Analytics로만 확인)
