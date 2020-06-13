const ShareDB = require('sharedb');
const OT = require('ot-text-unicode');
const log = require('./log.js');

const type = OT.type;

type.transformPresence = (range, ops, source) => {
  log.group("transformPresence", range, ops, source);
  try {
    if (range === undefined || range === null) {
      return range;
    }
    newRange = type.transformPosition(range, ops);
    console.log(range, ops, newRange);
    return newRange;
  } finally {
    log.groupEnd();
  }
};

ShareDB.types.register(type);

module.exports = { type };