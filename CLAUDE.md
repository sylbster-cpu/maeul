@AGENTS.md

## Claude에게만 해당하는 것

- 사용자가 휴대폰에서 바로 볼 수 있도록, 화면에 보이는 변경을 한 뒤에는 `page.html`을 Claude 게시 주소에 다시 게시합니다. 주소는 `docs/HANDOFF.md`에 있습니다. 게시할 때는 그 주소를 `url`로 넘기고, 바뀐 `src/` 파일을 `files`로 함께 올립니다. 올리지 않은 파일은 예전 것이 남습니다.

## 새 세션에서 알아 둘 것

Claude의 클라우드 세션에서 2026-11-22까지 확인한 것입니다. 환경이 바뀌면 맞지 않을 수 있으니, 막히면 다시 확인합니다.

- 세션마다 저장소가 새로 내려받아집니다. 이전 대화의 기억은 없습니다. 이어받을 것은 모두 이 저장소와 공동 대화 이슈에 있습니다.
- 브라우저 시험을 돌리려면 먼저 `npm install`을 합니다(three 하나). Playwright와 Chromium은 환경에 이미 있으므로 따로 설치하지 않습니다.
- 브라우저 시험은 `node tools/serve.mjs`를 뒤에서 띄운 채 돌립니다. 하나에 1분쯤 걸리므로 하나씩 돌리거나 뒤에서 돌리고 끝나기를 기다립니다. 앞에서 `sleep`으로 기다릴 수 없습니다.
- 컨테이너에서는 jsDelivr와 github.io가 열리지 않습니다. three.js 요청은 `tools/shot.mjs`가 `node_modules`의 것으로 대신 응답합니다. GitHub Pages 주소가 열리는지는 여기서 확인할 수 없고, 사용자가 보내 준 화면으로만 압니다.
- GitHub 작업(풀 리퀘스트 열기, 병합, 댓글, CI 다시 돌리기)은 GitHub MCP 도구(`mcp__github__…`)를 먼저 씁니다. 2026-11-22 세션의 환경 안내는 `gh`를 검색에만 쓰라고 했습니다. MCP 도구가 없을 때만 `gh api`를 씁니다. `gh pr create`는 막혀 있으므로 풀 리퀘스트는 `gh api repos/sylbster-cpu/maeul/pulls -f title=… -f head=… -f base=main -F body=@파일`로 엽니다. 병합(`-X PUT …/pulls/번호/merge -f merge_method=squash`)과 이슈 댓글(`…/issues/4/comments -F body=@파일`)도 같은 방식입니다.
- 다시 맞춘 브랜치를 올릴 때는 `git push --force-with-lease=브랜치:이전커밋의전체번호`를 씁니다. 번호 없이 쓰면 거절됩니다.
- 공개 저장소입니다. 이슈와 문서에 사용자의 이메일, 실명, 다른 저장소 이름을 적지 않습니다.
- 내려받은 저장소는 `main`만 따라갑니다. 다른 브랜치는 `git fetch origin 브랜치:refs/remotes/origin/브랜치`로 받습니다. 새 브랜치를 올린 뒤에는 `git config --add remote.origin.fetch '+refs/heads/브랜치:refs/remotes/origin/브랜치'`, `git fetch origin`, `git branch -u origin/브랜치`로 추적을 맞춥니다. 안 하면 끝날 때 "원격 브랜치가 없다"는 경고가 뜹니다. 올리기는 `git -c push.negotiate=true push -u origin 브랜치`.
- 브라우저 시험이 만드는 `shots/` 폴더는 저장소에 올리지 않습니다. 끝내기 전에 지웁니다(추적되지 않은 파일이 있으면 경고가 뜹니다).
- GPT는 의견을 이슈 #4뿐 아니라 해당 PR의 댓글로도 답니다. 이슈와 열린 PR의 댓글을 함께 읽습니다(2026-11-22에 PR #21 댓글을 놓쳤다).
- 병합은 사용자가 그 번호를 들어 시킨 때만 합니다. 그렇지 않으면 자동 승인 검사가 막습니다.
- CI의 `test/tour.mjs`가 가끔 흔들립니다. 실패한 작업만 다시 돌리려면 MCP 도구 `actions_run_trigger`의 `rerun_failed_jobs`를 씁니다. 없으면 `gh api -X POST repos/sylbster-cpu/maeul/actions/runs/실행번호/rerun-failed-jobs`.
- 이 컨테이너는 넓은 화면(1280×800)을 느리게 그립니다. 게임 시계는 한 화면에 0.05초까지만 세므로 실제 시간보다 느리게 갑니다. 낚시처럼 시간이 중요한 시험은 실제 시간이 아니라 게임 상태(`window.__game.fishing.elapsed` 등)를 보고 기다립니다. 누를 시간 안에 화면을 찍지 않습니다. 화면 좌표는 카메라가 멈춘 뒤에 구합니다.
- 하위 에이전트(Agent 도구)는 종류마다 쓸 수 있는 도구가 다릅니다. Explore와 Plan은 파일을 쓰지 못하고 글로만 돌려줍니다. general-purpose는 파일을 쓸 수 있습니다. 2026-11-22 세션에서는 보고서 파일을 쓰지 못했는데, 어느 종류였는지는 남아 있지 않습니다. 남길 것은 주 세션이 쓰는 편이 안전합니다.
- 영상 분석: ffmpeg와 ffprobe가 있고 글자 인식(OCR) 도구는 없습니다. 장면을 뽑아 그림으로 보고 읽습니다.
- Claude 게시 주소에 올릴 때(Artifact 도구) 새 세션에서는 늘 `url`을 넘깁니다. `url` 없이 올리면 같은 `page.html`이라도 새 주소가 생깁니다. 같은 파일 경로로 다시 올려 같은 주소로 가는 것은 한 대화 안에서만입니다. 새 세션에서 그 주소에 처음 올리기 전에는 먼저 읽기(`action: "read"`)를 해야 거절되지 않습니다. 따로 미리 보기 주소를 만들려면 `url` 없이 다른 경로에 복사해 올립니다.
