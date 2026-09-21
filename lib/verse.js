// Almeida, public-domain translation. A dated selection keeps the verse stable
// across reloads and restarts, including when the external service is unavailable.
const verses = [
  ['PHP/4/13', 'Filipenses 4:13', 'Posso todas as coisas naquele que me fortalece.'],
  ['PSA/46/1', 'Salmos 46:1', 'Deus é o nosso refúgio e fortaleza, socorro bem presente na angústia.'],
  ['PSA/23/1', 'Salmos 23:1', 'O Senhor é o meu pastor; nada me faltará.'],
  ['PRO/16/3', 'Provérbios 16:3', 'Entrega ao Senhor as tuas obras, e teus desígnios serão estabelecidos.'],
  ['PSA/37/5', 'Salmos 37:5', 'Entrega o teu caminho ao Senhor; confia nele, e ele tudo fará.'],
  ['1TH/5/18', '1 Tessalonicenses 5:18', 'Em tudo dai graças; porque esta é a vontade de Deus em Cristo Jesus para convosco.'],
  ['ROM/12/12', 'Romanos 12:12', 'Alegrai-vos na esperança, sede pacientes na tribulação, perseverai na oração.'],
  ['PSA/56/3', 'Salmos 56:3', 'Em me vindo o temor, hei de confiar em ti.'],
  ['PRO/3/5', 'Provérbios 3:5', 'Confia no Senhor de todo o teu coração, e não te estribes no teu próprio entendimento.'],
  ['PSA/121/2', 'Salmos 121:2', 'O meu socorro vem do Senhor, que fez os céus e a terra.'],
  ['1CO/16/14', '1 Coríntios 16:14', 'Todas as vossas obras sejam feitas em amor.'],
  ['PSA/119/105', 'Salmos 119:105', 'Lâmpada para os meus pés é a tua palavra, e luz para o meu caminho.'],
  ['MAT/5/9', 'Mateus 5:9', 'Bem-aventurados os pacificadores, porque eles serão chamados filhos de Deus.'],
  ['PSA/118/24', 'Salmos 118:24', 'Este é o dia que o Senhor fez; regozijemo-nos, e alegremo-nos nele.']
];
export function createDailyVerse({ fetchImpl = fetch, now = () => new Date() } = {}) {
  let cache;
  return function dailyVerse() {
    const current = now();
    const date = `${current.getFullYear()}-${String(current.getMonth()+1).padStart(2,'0')}-${String(current.getDate()).padStart(2,'0')}`;
    if (cache?.date === date) return cache.promise;
    const day = Math.floor(Date.UTC(current.getFullYear(),current.getMonth(),current.getDate()) / 86400000);
    const [query, reference, fallback] = verses[((day % verses.length) + verses.length) % verses.length];
    const [book, chapter, number] = query.split('/');
    const url = `https://bible-api.com/data/almeida/${book}/${chapter}`;
    const promise = (async () => {
      const base = { date, reference, translation: 'João Ferreira de Almeida', url };
      try {
        const response = await fetchImpl(url, { signal: AbortSignal.timeout(5000) });
        if (!response.ok) throw new Error('Verse service unavailable');
        const data = await response.json();
        const verse = data.verses?.find(v => v.book_id === book && v.chapter === Number(chapter) && v.verse === Number(number));
        if (data.translation?.identifier !== 'almeida' || typeof verse?.text !== 'string' || !verse.text.trim() || verse.text.length > 3000) throw new Error('Invalid verse');
        return { ...base, text: verse.text.trim(), source: 'api' };
      } catch {
        return { ...base, text: fallback, source: 'local' };
      }
    })();
    cache = { date, promise };
    return promise;
  };
}
