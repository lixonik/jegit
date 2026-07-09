import * as vscode from 'vscode';

export function renderVersionControlHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const nonce = makeNonce();
  const media = (...parts: string[]) =>
    webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', ...parts));
  const cssUri = media('vcs.css');
  const jsUri = media('vcs.js');
  const graphUri = media('graph.js');
  const treeUri = media('tree.js');
  const logfilterUri = media('logfilter.js');
  const datefmtUri = media('datefmt.js');
  const refchipUri = media('refchip.js');
  const codiconUri = media('codicons', 'codicon.css');
  const csp = `default-src 'none'; img-src ${webview.cspSource}; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; script-src 'nonce-${nonce}';`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="${csp}" />
<link href="${codiconUri}" rel="stylesheet" />
<link href="${cssUri}" rel="stylesheet" />
<title>JeGit</title>
</head>
<body>
  <div class="tabbar">
    <div class="tab active" data-tab="local">Local Changes</div>
    <div class="tab" data-tab="log">Log</div>
    <div class="tab" data-tab="shelf">Shelf</div>
    <div class="tab" data-tab="console">Console</div>
    <div class="branch" id="branch"></div>
  </div>

  <div class="tabpanel active" data-tab="local">
    <div class="toolbar">
      <button class="tool" id="tb-focus" title="Focus commit message"><i class="codicon codicon-check"></i></button>
      <button class="tool" id="tb-refresh" title="Refresh"><i class="codicon codicon-refresh"></i></button>
      <button class="tool" id="tb-new" title="New changelist"><i class="codicon codicon-add"></i></button>
      <span class="sep"></span>
      <button class="tool" id="tb-rollback" title="Rollback selected"><i class="codicon codicon-discard"></i></button>
      <button class="tool" id="tb-shelve" title="Shelve selected"><i class="codicon codicon-archive"></i></button>
      <span class="sep"></span>
      <button class="tool" id="tb-expand" title="Expand all"><i class="codicon codicon-expand-all"></i></button>
      <button class="tool" id="tb-collapse" title="Collapse all"><i class="codicon codicon-collapse-all"></i></button>
      <span class="sep"></span>
      <button class="tool" id="tb-group" title="Group by directory / flat list"><i class="codicon codicon-list-tree"></i></button>
    </div>
    <div class="op-banner" id="op-banner" style="display:none"></div>
    <div class="tree" id="tree"></div>
    <div class="commit-area">
      <textarea id="message" placeholder="Commit Message" rows="2"></textarea>
      <div class="commit-row">
        <button class="tool" id="msg-history" title="Recall a recent commit message"><i class="codicon codicon-history"></i></button>
        <label class="opt"><input type="checkbox" id="amend" /> Amend</label>
        <label class="opt"><input type="checkbox" id="signoff" /> Sign-off</label>
        <input type="text" id="author" class="author-input" placeholder="Author (optional)" title="Commit as another author: Name &lt;email&gt;" />
        <span class="selinfo" id="selinfo"></span>
        <span class="spacer"></span>
        <button class="btn primary" id="commit" disabled>Commit</button>
        <button class="btn secondary" id="commitPush" disabled>Commit and Push</button>
      </div>
    </div>
  </div>

  <div class="tabpanel" data-tab="log">
    <div class="log-toolbar">
      <button class="log-filter" id="log-branch" title="Filter by branch"><i class="codicon codicon-git-branch"></i> Branch</button>
      <select id="log-user" class="log-select" title="Filter by author"><option value="">User: all</option></select>
      <select id="log-date" class="log-select" title="Filter by date">
        <option value="">Date: all</option>
        <option value="1">Last 24 hours</option>
        <option value="7">Last 7 days</option>
        <option value="30">Last 30 days</option>
        <option value="365">Last year</option>
      </select>
      <button class="log-filter" id="log-path" title="Filter by path"><i class="codicon codicon-filter"></i> Paths</button>
      <input id="log-search" class="log-search" placeholder="Search..." />
      <span class="sep"></span>
      <button class="tool" id="log-cherrypick" title="Cherry-Pick the selected commit onto the current branch"><i class="codicon codicon-git-commit"></i></button>
      <button class="tool" id="log-refresh" title="Refresh log"><i class="codicon codicon-refresh"></i></button>
    </div>
    <div class="log-body">
      <div class="log-branches" id="log-branches"></div>
      <div class="splitter" id="split-branches"></div>
      <div class="log-left">
        <div class="log-header"><span class="lh-graph"></span><span class="lh-subject">Subject</span><span class="lh-author">Author</span><span class="lh-date">Date</span></div>
        <div class="log-list" id="log-list"></div>
      </div>
      <div class="splitter" id="split-details"></div>
      <div class="log-details" id="log-details"><div class="placeholder">Select a commit to see its details.</div></div>
    </div>
  </div>

  <div class="tabpanel" data-tab="shelf">
    <div class="toolbar">
      <button class="tool" id="shelf-refresh" title="Refresh shelf"><i class="codicon codicon-refresh"></i></button>
    </div>
    <div class="tree" id="shelf-list"></div>
  </div>
  <div class="tabpanel" data-tab="console"><div class="console" id="console-log"></div></div>

  <div class="ctx-menu" id="ctxmenu"></div>
  <script nonce="${nonce}" src="${graphUri}"></script>
  <script nonce="${nonce}" src="${treeUri}"></script>
  <script nonce="${nonce}" src="${logfilterUri}"></script>
  <script nonce="${nonce}" src="${datefmtUri}"></script>
  <script nonce="${nonce}" src="${refchipUri}"></script>
  <script nonce="${nonce}" src="${jsUri}"></script>
</body>
</html>`;
}

function makeNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let i = 0; i < 24; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
  return s;
}
