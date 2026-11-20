@AGENTS.md

## Claude에게만 해당하는 것

- 사용자가 휴대폰에서 바로 볼 수 있도록, 화면에 보이는 변경을 한 뒤에는 `page.html`을 Claude 게시 주소에 다시 게시합니다. 주소는 `docs/HANDOFF.md`에 있습니다. 게시할 때는 그 주소를 `url`로 넘기고, 바뀐 `src/` 파일을 `files`로 함께 올립니다. 올리지 않은 파일은 예전 것이 남습니다.

## 새 세션에서 알아 둘 것

Claude의 클라우드 세션에서 2026-11-20까지 확인한 것입니다. 환경이 바뀌면 맞지 않을 수 있으니, 막히면 다시 확인합니다.

- 세션마다 저장소가 새로 내려받아집니다. 이전 대화의 기억은 없습니다. 이어받을 것은 모두 이 저장소와 공동 대화 이슈에 있습니다.
- 브라우저 시험을 돌리려면 먼저 `npm install`을 합니다(three 하나). Playwright와 Chromium은 환경에 이미 있으므로 따로 설치하지 않습니다.
- 브라우저 시험은 `node tools/serve.mjs`를 뒤에서 띄운 채 돌립니다. 하나에 1분쯤 걸리므로 하나씩 돌리거나 뒤에서 돌리고 끝나기를 기다립니다. 앞에서 `sleep`으로 기다릴 수 없습니다.
- 컨테이너에서는 jsDelivr와 github.io가 열리지 않습니다. three.js 요청은 `tools/shot.mjs`가 `node_modules`의 것으로 대신 응답합니다. GitHub Pages 주소가 열리는지는 여기서 확인할 수 없고, 사용자가 보내 준 화면으로만 압니다.
- `gh pr create`는 막혀 있습니다. 풀 리퀘스트는 `gh api repos/sylbster-cpu/maeul/pulls -f title=… -f head=… -f base=main -F body=@파일`로 엽니다. 병합(`-X PUT …/pulls/번호/merge -f merge_method=squash`)과 이슈 댓글(`…/issues/4/comments -F body=@파일`)도 같은 방식입니다.
- 다시 맞춘 브랜치를 올릴 때는 `git push --force-with-lease=브랜치:이전커밋의전체번호`를 씁니다. 번호 없이 쓰면 거절됩니다.
- 공개 저장소입니다. 이슈와 문서에 사용자의 이메일, 실명, 다른 저장소 이름을 적지 않습니다.
