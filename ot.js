const ShareDB = require('sharedb');
const OT = require('ot-text-unicode');
const log = require('./log.js');

const type = OT.type;

type.transformPresence = (range, ops, source) => {
  log.group("transformPresence", range, ops, source);
  try {
    if (range === undefined) {
      return;
    }
    return type.transformPosition(range, ops);
  } finally {
    log.groupEnd();
  }
};

ShareDB.types.register(type);

module.exports = { type };