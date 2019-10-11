"use strict";

const {sortObjByVal} = require("./util");
const {accumulativeRelativeCred} = require("./scoreInterpretation");
const add = (a, b) => a + b;

const CRITICAL = 4;
const HIGH = 3;
const MEDIUM = 2;
const LOW = 1;

// Impact ratings, based on absolute cred.
const rate = (cred) => (cred >= 1000 ? HIGH : cred >= 300 ? MEDIUM : LOW);

const offsetRating = (user, project) =>
  Math.min(user + Math.max(project - 1, 0), CRITICAL);

const accumulativeRelativeCredMap = (scoreMap, fraction) => {
  const results = new Map();

  for (const [ref, scores] of scoreMap.entries()) {
    const users = scores[1].users;
    const selected = accumulativeRelativeCred(fraction, users);
    const map = new Map(selected.map((u) => [u.address[4], u.totalCred]));
    results.set(ref, map);
  }

  return results;
};

const userBusFactor = (scoreMap, opts) => {
  // Where 60% of the work is done by 5 people or less.
  const {fraction, userThreshold, minTotalRating} = {
    fraction: 0.6,
    userThreshold: 4,
    minTotalRating: LOW,
    ...(opts || {}),
  };

  // Find the projects meeting these criteria.
  const accum = accumulativeRelativeCredMap(scoreMap, fraction);
  for (const [ref, users] of accum.entries()) {
    if (users.size > userThreshold) {
      accum.delete(ref);
    }
  }

  let sumReliance = 0;
  const scorePerUser = {};

  for (const [ref, users] of accum.entries()) {
    for (const [name, score] of users.entries()) {
      const current = scorePerUser[name] || 0;
      scorePerUser[name] = current + score;
      sumReliance += score;
    }
  }

  const projectRatings = new Map();
  for (const [ref, users] of accum.entries()) {
    projectRatings.set(ref, rate(Array.from(users.values()).reduce(add, 0)));
  }

  const relativeReliance = {};
  const results = {};
  for (const name in scorePerUser) {
    const userRating = rate(scorePerUser[name]);
    const relativeScore =
      Math.round((scorePerUser[name] / sumReliance) * 1000) / 1000;

    let maxProjectRating = 0;
    const contributions = {};
    for (const [ref, users] of accum.entries()) {
      if (!users.has(name)) continue;
      contributions[ref] = users.get(name);
      maxProjectRating = Math.max(
        maxProjectRating,
        projectRatings.get(ref) || 0
      );
    }

    const totalRating = offsetRating(userRating, maxProjectRating);

    if (totalRating >= minTotalRating) {
      results[name] = {
        score: scorePerUser[name],
        relativeScore,
        userRating,
        maxProjectRating,
        totalRating,
        contributions: sortObjByVal(contributions),
      };
    }
  }

  return results;
};

module.exports = {
  userBusFactor,
};
