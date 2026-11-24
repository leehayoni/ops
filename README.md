# ops — 전체 서비스 운영 점검

매일 09:17(KST) GitHub Actions가 `services.json`의 모든 서비스를 점검합니다. 비용 0원(공개 리포의 Actions는 무료).

## 무엇을 보나
- 페이지 응답(다운·느림), API 응답과 기대값
- 배포본에 GA ID가 실제로 들어갔는지
- Vercel Hobby(비상업)에서 제휴·광고 수익 모델을 돌리는지, 배포본에 제휴 링크가 몰래 들어갔는지
- 가격 데이터 기준일(asOf)이 30일 넘었는지
- 리포 없음, 시즌 종료 같은 운영 메모

문제(🔴/🟡)는 이 리포에 `ops` 라벨 이슈로 열리고(GitHub이 메일로 알림), 해결되면 다음 점검 때 자동으로 닫힙니다.
결과는 `STATUS.md`(사람용)와 `status.json`(봇용)에 매일 커밋됩니다. 주간 CTO 리포트가 이 파일을 읽습니다.

## 새 서비스를 배포했을 때
`services.json`의 `services`에 한 덩어리 추가 → 커밋·푸시. 끝.

```json
{ "id": "slug", "name": "서비스 이름", "day": 8, "deployed": "2026-11-25", "status": "active",
  "url": "https://xxx.vercel.app", "pages": ["/"], "repo": "leehayoni/xxx", "ga": null, "money": "none" }
```
- `money`: none | donation | affiliate | ads | paid
- 접을 때는 `status`를 `retired`로 바꾸면 점검에서 빠집니다.

## 수동 실행
GitHub → Actions → ops-check → Run workflow. 로컬: `node check.mjs`

## GitHub 계정 두 개 (leehayoni, arklyonoff-code)
사이트 점검은 계정과 무관하게 URL로 합니다. 리포 정보(최근 커밋, 사용자 신고 이슈)는 계정별 읽기 전용 토큰으로 읽습니다.
`services.json`의 `accounts`에 계정 → Secret 이름이 있습니다. 계정을 더 만들면 여기에 한 줄 추가하고 워크플로 env에도 추가합니다.

토큰 만들기(계정마다 한 번):
1. 그 계정으로 로그인 → Settings → Developer settings → Fine-grained tokens → Generate new token
2. Resource owner: 그 계정 / Repository access: **All repositories** (앞으로 만들 리포도 자동 포함)
3. Permissions: Contents **Read-only**, Issues **Read-only** (Metadata는 자동)
4. 만료: 1년. 만료되면 점검에 `repo-access` 경고가 뜹니다.
5. leehayoni/ops → Settings → Secrets and variables → Actions → New repository secret 에 붙여넣기
   (leehayoni 토큰 → `LEEHAYONI_TOKEN`, arklyonoff-code 토큰 → `ARKLY_TOKEN`). 토큰은 채팅·명령줄에 쓰지 않습니다.
