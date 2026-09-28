export const NAVIGATION_KEYS = ['overview','transactions','debts','bills','investments','personal','notes'];
export const WORKSPACE_KEYS = ['finance','investments','notes','personal'];

export function createPreferencesStore(db, AppError) {
  db.exec('CREATE TABLE IF NOT EXISTS app_preferences(id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL);');
  const defaults = () => ({navigation:[...NAVIGATION_KEYS],workspaces:[...WORKSPACE_KEYS]});
  function validate(raw) {
    if (!raw || typeof raw !== 'object') throw new AppError('Preferências inválidas.');
    const result={};
    for (const [name,keys] of [['navigation',NAVIGATION_KEYS],['workspaces',WORKSPACE_KEYS]]) {
      const value=raw[name];
      if (!Array.isArray(value)||value.length!==keys.length||new Set(value).size!==keys.length||value.some(key=>!keys.includes(key))) throw new AppError('Inclua cada aba uma única vez na ordem.');
      result[name]=[...value];
    }
    return result;
  }
  const list=()=>{const row=db.prepare('SELECT data FROM app_preferences WHERE id=1').get();return row?JSON.parse(row.data):defaults();};
  const replace=raw=>db.prepare('INSERT INTO app_preferences(id,data) VALUES (1,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(JSON.stringify(raw));
  return {list,validate,replace,update(raw){const value=validate({...list(),...raw});replace(value);return value;}};
}
