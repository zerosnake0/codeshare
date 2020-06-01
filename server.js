const http = require('http');
const path = require('path');
const express = require('express');
const ShareDB = require('sharedb');
const OT = require('ot-text-unicode');
const WS = require('ws');
const WebSocketJSONStream = require('@teamwork/websocket-json-stream');
const shortid = require('shortid');

ShareDB.types.register(OT.type);

const backend = new ShareDB();
const connection = backend.connect();

/*
const createDoc = (callback) => {

  const doc = connection.get('examples', 'codemirror');
  doc.fetch((err) => {
    if (err) {
      throw err;
    }
    console.debug("doc.type", doc.type);
    if (doc.type === null) {
      doc.create("// hello world", OT.type.name, callback);
      return;
    }
    callback();
  });
};

const startServer = () => {
  
};

const backend = new ShareDB();
createDoc(startServer);
*/

const app = express();

// static
const static = express.static('static');
app.use(static);

// client
app.post("/client", (req, res) => {
  const id = shortid.generate();
  res.redirect(`/client/${id}`);
});

const clientPage = path.resolve(__dirname, "static/client.html");
app.use("/client/:id", (req, res) => {
  const id = req.params.id;
  const doc = connection.get("examples", id);
  // console.log(id, doc.type);
  if (doc.type === null) {
    doc.create("// hello world", OT.type.name, (err) => {
      if (err) {
        console.error(`error while creating doc "${id}"`, err);
      } else {
        console.log(`doc "${id}" created`);
      }
    });
  }
  res.sendFile(clientPage);
  // res.redirect(`/client.html?id=${id}`);
});

const server = http.createServer(app);

const wss = new WS.Server({
  server: server,
  path: "/client"
});
wss.on('connection', (ws) => {
  const stream = new WebSocketJSONStream(ws);
  backend.listen(stream);
});

const port = 8080;
server.listen(port);
console.debug(`Listening on ${port}`);