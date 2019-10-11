'use strict';

const globalCredOf = users => users.reduce((sum, u) => sum + u.totalCred, 0);

const accumulativeRelativeCred = (fraction, users) => {
  const globalCred = globalCredOf(users);
  const targetAccumulative = globalCred * fraction;
  const selectedUsers = [];
  for(let acc=0, cred=0, i=0; acc < targetAccumulative; i++) {
    const user = users[i];
    selectedUsers.push(user);
    acc += user.totalCred;
  }
  return selectedUsers;
}

module.exports = {
  globalCredOf,
  accumulativeRelativeCred
};
