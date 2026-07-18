(() => {
  "use strict";
  const files = ["ruwordnet-common-01.js","ruwordnet-common-02.js","ruwordnet-common-03.js","ruwordnet-common-04.js","ruwordnet-common-05.js","ruwordnet-common-06.js","ruwordnet-common-07.js","ruwordnet-common-08.js","ruwordnet-common-09.js","ruwordnet-common-10.js","proper-names-01.js","proper-names-02.js","geography-01.js","geography-02.js","geography-03.js","geography-04.js","countries-01.js","geographic-entities-01.js"];
  window.SCANWORD_BULK_LEXICON_FILES = files;
  if (typeof require === "function") {
    for (const file of files) require(`./${file}`);
    return;
  }
  const current = document.currentScript?.src || "";
  const base = current.slice(0, current.lastIndexOf("/") + 1);
  document.write(files.map((file) => `<script src="${base}${file}"><\/script>`).join(""));
})();
