export function sessionResources(getOwner) {
  let owner;
  const entries = new Map();

  function currentOwner() {
    const current = getOwner();
    if (current !== owner) {
      entries.clear();
      owner = current;
    }
    return current;
  }

  function peek(key, maxAge = Infinity) {
    if (!currentOwner()) return;
    const entry = entries.get(key);
    if (entry && Date.now() - entry.at <= maxAge) return entry.value;
  }

  function load(key, fetchValue, maxAge) {
    const requestedBy = currentOwner();
    const value = peek(key, maxAge);
    if (value !== undefined) return Promise.resolve(value);
    const entry = entries.get(key) || {};
    if (entry.pending) return entry.pending;
    entry.pending = Promise.resolve().then(fetchValue).then(result => {
      if (currentOwner() !== requestedBy) return;
      if (entries.get(key) !== entry) return entries.get(key)?.value;
      entry.value = result;
      entry.at = Date.now();
      return result;
    }).finally(() => { delete entry.pending; });
    entries.set(key, entry);
    return entry.pending;
  }

  function set(key, value) {
    if (currentOwner()) entries.set(key, {value, at:Date.now()});
  }

  function invalidate(...keys) {
    if (keys.length) keys.forEach(key => entries.delete(key));
    else entries.clear();
  }

  return {peek, load, set, invalidate};
}
