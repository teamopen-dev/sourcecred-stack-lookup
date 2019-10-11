"use strict";

exports.hexOf = (str) => Buffer.from(str, "utf8").toString("hex");

exports.sortObjByVal = (obj, ascending) => {
  const newObj = {};
  const keys = Object.keys(obj);
  const dir = (ascending && 1) || -1;
  keys.sort((a, b) => {
    if (obj[b] > obj[a]) return -dir;
    if (obj[b] < obj[a]) return dir;
    return 0;
  });
  for (const k of keys) {
    newObj[k] = obj[k];
  }
  return newObj;
};
