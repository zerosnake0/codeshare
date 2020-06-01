const sharedb = require('sharedb/lib/client');
const CodeMirror = require('codemirror');
const shortid = require('shortid');
const { hcl } = require('d3-color');
const OT = require('./ot.js');
const log = require('./log.js');
require('./cm.js');

const ReconnectingWebSocket = require('reconnecting-websocket');
const wsproto = window.location.protocol === "https:" ? 'wss://' : "ws://";
const socket = new ReconnectingWebSocket(wsproto + window.location.host + "/client");
const connection = new sharedb.Connection(socket);

const element = document.getElementById("textarea");
const connStatusSpan = document.getElementById('conn-status-span');
const docStatusSpan = document.getElementById('doc-status-span');
connStatusSpan.innerHTML = 'Not Connected';

// element.style.backgroundColor = 'gray';
socket.addEventListener('open', function () {
  log.info("socket connected");
  connStatusSpan.innerHTML = 'Connected';
  connStatusSpan.style.backgroundColor = 'white';
});

socket.addEventListener('close', function () {
  log.info("socket cloed");
  connStatusSpan.innerHTML = 'Closed';
  connStatusSpan.style.backgroundColor = 'gray';
});

socket.addEventListener('error', function () {
  log.info("socket error");
  connStatusSpan.innerHTML = 'Error';
  connStatusSpan.style.backgroundColor = 'red';
});

const setDocStatus = (msg) => {
  docStatusSpan.innerHTML = msg;
};

setDocStatus("initializing...");

let needSync = false;
const codeMirror = new CodeMirror(element, {
  readOnly: true,
  lineNumbers: true,
  viewportMargin: Infinity,
});

const findMode = (mode) => {
  for (let i = 0; i < CodeMirror.modeInfo.length; i++) {
    const info = CodeMirror.modeInfo[i];
    if (info.mode === mode) {
      return info;
    }
  }
};

(() => {
  const sel = document.getElementById("mode");
  for (name in CodeMirror.modes) {
    const mode = findMode(name);
    // log.info(name, mode);
    if (mode) {
      const opt = document.createElement('option');
      opt.text = mode.name;
      opt.value = mode.mode;
      sel.append(opt);
    }
  }
  sel.addEventListener("change", (event) => {
    const mode = event.target.value;
    log.info("setting codemirror mode to", mode);
    codeMirror.setOption("mode", mode);
  });
})();

const [addHistory, clearHistory] = (() => {
  const history = document.getElementById("history");

  return [(txt) => {
    const record = document.createElement("div");
    const code = document.createElement("pre");
    code.innerHTML = txt;
    record.appendChild(code);
    history.prepend(record);
  }, () => {
    history.innerHTML = "";
  }];
})();

(() => {
  const clear = document.getElementById("clear");
  clear.addEventListener("click", clearHistory);
})();

// Create local Doc instance mapped to 'examples' collection document with id 'textarea'
const pathnames = window.location.pathname.split("/");
const collection = 'codemirror';
const docID = pathnames[pathnames.length - 1];
const doc = connection.get(collection, docID);
const presenceID = shortid.generate();

doc.subscribe(function (err) {
  if (err) throw err;

  log.info("doc", doc);
  // log.info("doc.data", doc.data);
  codeMirror.setValue(doc.data);
  codeMirror.setOption("readOnly", false);
  setDocStatus("initialized");

  doc.on('error', (err) => {
    console.error("error occured", err);
  });

  doc.on('before op', (ops, source) => {
    log.info("doc before op:", ops, source);
  });

  doc.on("op", (ops, source) => {
    log.group("doc op:", ops, source);
    try {
      if (source) {
        return;
      }
      OT.type.checkOp(ops);
      let index = 0;
      for (let i = 0; i < ops.length; i++) {
        const c = ops[i];
        switch (typeof c) {
          case 'object': {
            const posFrom = codeMirror.posFromIndex(index);
            const posTo = codeMirror.posFromIndex(index + c.d);
            codeMirror.replaceRange("", posFrom, posTo, "+sharedb");
            break;
          }
          case 'string': {
            const posFrom = codeMirror.posFromIndex(index);
            codeMirror.replaceRange(c, posFrom, posFrom, "+sharedb");
            index += c.length;
            break;
          }
          case 'number': {
            index += c;
            break;
          }
          default: {
            throw new Error("unknown type of", c);
          }
        }
      }
    } catch (thrown) {
      console.error(thrown.message);
      throw thrown;
    } finally {
      log.groupEnd();
    }
  });

  const sync = () => {
    doc.fetch((err) => {
      if (err) {
        console.error("error while fetching, resync in 5 sec", err);
        setTimeout(sync, 5000);
      } else {
        // log.info("codeMirror.getValue()", codeMirror.getValue())
        if (doc.type === null) {
          setDocStatus("synchronization failed... please save your doc manually and refresh");
          // doc.create(codeMirror.getValue(), (err) => {
          //   if (err) {
          //     console.error("error while creating, resync in 5 sec", err);
          //     setTimeout(sync, 5000);
          //   } else {
          //     log.info("doc created with local data");
          //     needSync = false;
          //   }
          // });
        } else {
          addHistory(codeMirror.getValue());
          codeMirror.setValue(doc.data);
        }
      }
    });
  };

  codeMirror.on("beforeChange", (codeMirror, change) => {
    log.group("on codeMirror beforeChange");
    try {
      if (needSync) {
        log.info("need sychronize");
        while (change) {
          if (change.origin !== "setValue") {
            change.cancel();
          }
          change = change.next;
        }
      } else {
        while (change) {
          log.info("change", change);
          if (change.origin !== "+sharedb") {
            const indexFrom = codeMirror.indexFromPos(change.from);
            const indexTo = codeMirror.indexFromPos(change.to);
            doc.submitOp([
              indexFrom,
              { d: indexTo - indexFrom },
              change.text.join("\n")
            ], (err) => {
              if (err) {
                console.error("error while submitting", err);
                setDocStatus("synchronizing...");
                if (!needSync) {
                  log.info("already synchronizing...");
                  needSync = true;
                  sync();
                }
              }
            });
          }
          change = change.next;
        }
      }
    } catch (thrown) {
      console.error(thrown.message);
      throw thrown;
    } finally {
      log.groupEnd();
    }
  });

  codeMirror.on("change", (codeMirror, change) => {
    log.group("on codeMirror change");
    try {
      // log.info("doc.data", doc.data);
      if (needSync) {
        while (change) {
          if (change.origin === "setValue") {
            needSync = false;
            log.info("sync finished");
            setDocStatus("synchronization finished, old data has been saved in history");
          }
          change = change.next;
        }
      }
    } finally {
      log.groupEnd();
    }
  });

  const presence = doc.connection.getDocPresence(collection, docID);
  presence.subscribe((err) => {
    if (err) {
      console.error("presence subscribe error", err);
      throw err;
    }
  });
  const localPresence = presence.create(presenceID);

  codeMirror.on('cursorActivity', (codeMirror) => {
    log.group('on codeMirror cursorActivity', codeMirror);
    try {
      const cursorPos = codeMirror.getCursor();
      const index = codeMirror.indexFromPos(cursorPos);
      localPresence.submit(index, (err) => {
        if (err) {
          console.error("local presence submit error", err);
        }
      });
    } finally {
      log.groupEnd();
    }
  });

  const presenceMap = {};

  const getPresence = (id) => {
    if (!(id in presenceMap)) {
      const color = hcl(Math.random() * 180, 90, 35);

      const w = document.createElement("span");
      w.className = "presence-widget";
      w.id = id;
      w.innerHTML = id;
      w.style.backgroundColor = color;

      const bm = document.createElement("span");
      bm.className = "presence-cursor";
      bm.id = id;
      bm.innerHTML = " ";
      bm.style.backgroundColor = color;

      presenceMap[id] = {
        color: color,
        bm: bm,
        w: w,
      };
    }
    return presenceMap[id];
  };

  presence.on('receive', (id, range) => {
    log.group('on presence receive', id, range);
    try {
      if (id === presenceID) {
        return;
      }
      const p = getPresence(id);

      const pos = codeMirror.posFromIndex(range);
      codeMirror.addWidget(pos, p.w);
      codeMirror.setBookmark(pos, {
        widget: p.bm,
      });
    } finally {
      log.groupEnd();
    }
  });
});
