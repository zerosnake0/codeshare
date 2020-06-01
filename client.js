const sharedb = require('sharedb/lib/client');
const OT = require('ot-text-unicode');
const CodeMirror = require('codemirror');
require('./cm.js');

sharedb.types.register(OT.type);

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
  console.log("socket connected");
  connStatusSpan.innerHTML = 'Connected';
  connStatusSpan.style.backgroundColor = 'white';
});

socket.addEventListener('close', function () {
  console.log("socket cloed");
  connStatusSpan.innerHTML = 'Closed';
  connStatusSpan.style.backgroundColor = 'gray';
});

socket.addEventListener('error', function () {
  console.log("socket error");
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
    // console.log(name, mode);
    if (mode) {
      const opt = document.createElement('option');
      opt.text = mode.name;
      opt.value = mode.mode;
      sel.append(opt);
    }
  }
  sel.addEventListener("change", (event) => {
    const mode = event.target.value;
    console.log("setting codemirror mode to", mode);
    codeMirror.setOption("mode", mode);
  });
})();

const [addHistory, clearHistory] = (() => {
  const history = document.getElementById("history");

  return [(txt) => {
    const record = document.createElement("div");
    const code = document.createElement("code");
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
const doc = connection.get('examples', pathnames[pathnames.length - 1]);

doc.subscribe(function (err) {
  if (err) throw err;

  console.log("doc", doc);
  // console.log("doc.data", doc.data);
  codeMirror.setValue(doc.data);
  codeMirror.setOption("readOnly", false);
  setDocStatus("initialized");

  doc.on('error', (err) => {
    console.error("error occured", err);
  });

  doc.on('before op', (ops, source) => {
    console.log("doc before op:", ops, source);
  });

  doc.on("op", (ops, source) => {
    console.group("doc op:", ops, source);
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
          default:
            throw new Error("unknow type of", c);
        }
      }
    } catch (thrown) {
      console.error(thrown.message);
      throw thrown;
    } finally {
      console.groupEnd();
    }
  });

  const sync = () => {
    doc.fetch((err) => {
      if (err) {
        console.error("error while fetching, resync in 5 sec", err);
        setTimeout(sync, 5000);
      } else {
        // console.log("codeMirror.getValue()", codeMirror.getValue())
        if (doc.type === null) {
          setDocStatus("synchronization failed... please save your doc manually and refresh");
          // doc.create(codeMirror.getValue(), (err) => {
          //   if (err) {
          //     console.error("error while creating, resync in 5 sec", err);
          //     setTimeout(sync, 5000);
          //   } else {
          //     console.log("doc created with local data");
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
    console.group("on codeMirror beforeChange");
    try {
      if (needSync) {
        console.log("need sychronize");
        while (change) {
          if (change.origin !== "setValue") {
            change.cancel();
          }
          change = change.next;
        }
      } else {
        while (change) {
          console.log("change", change);
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
                  console.log("already synchronizing...");
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
      console.groupEnd();
    }
  });

  codeMirror.on("change", (codeMirror, change) => {
    console.group("on codeMirror change");
    try {
      // console.log("doc.data", doc.data);
      if (needSync) {
        while (change) {
          if (change.origin === "setValue") {
            needSync = false;
            console.log("sync finished");
            setDocStatus("synchronization finished, old data has been saved in history");
          }
          change = change.next;
        }
      }
    } finally {
      console.groupEnd();
    }
  });
});