const workbook = 'https://docs.google.com/spreadsheets/d/1Hg6oXqMgzrlZdsegKx95umBZLtxRMnkMWsKyolpZvxk';
const tabs = {
  roster: ['1115419346', 'MODEL BOAT RACE'],
  races: ['567783241', 'GROUP STAGE'],
  standings: ['977010409', 'GROUP STAGE STANDINGS'],
  bracket: ['2053648908', 'TOP 8 SINGLE-ELIMINATION'],
};

function parseCsv(value) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const input = value.replace(/^\uFEFF/, '');
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (char === '"' && quoted && input[i + 1] === '"') {
      field += '"';
      i++;
    } else if (char === '"' && (quoted || !field)) {
      quoted = !quoted;
    } else if (!quoted && char === ',') {
      row.push(field);
      field = '';
    } else if (!quoted && (char === '\n' || char === '\r')) {
      if (char === '\r' && input[i + 1] === '\n') i++;
      rows.push([...row, field]);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }
  if (quoted) throw new Error('Incomplete CSV');
  if (row.length || field) rows.push([...row, field]);
  return rows;
}

async function readTab([gid, title], signal) {
  const url = new URL(`${workbook}/export`);
  url.search = new URLSearchParams({ format: 'csv', gid, _: String(Date.now()) });
  const response = await fetch(url, { credentials: 'omit', cache: 'no-store', signal });
  if (!response.ok || !response.headers.get('content-type')?.includes('text/csv')) {
    throw new Error(`Unexpected export response for tab ${gid} (${response.status})`);
  }
  const rows = parseCsv(await response.text());
  if (!rows[0]?.[0]?.trimStart().startsWith(title)) throw new Error('Unexpected worksheet layout');
  return rows;
}

const numberedRows = (rows, width) =>
  rows.filter(row => /^\d+$/.test(row[0]?.trim())).map(row => row.slice(0, width));

function parseBracket(bracket) {
  function match(row, col, title) {
    const at = (offset, column) => bracket[row + offset]?.[col + column] || '';
    return {
      title,
      slot: at(0, 2),
      lanes: [1, 2].map(offset => ({
        seed: /^\d+$/.test(at(offset, 0)) ? at(offset, 0) : '',
        name: at(offset, 1),
        time: at(offset, 2),
      })),
      winner: at(3, 1),
    };
  }

  return [
    { title: 'Quarterfinals', matches: [5, 11, 17, 23].map((row, i) => match(row, 0, `Quarterfinal ${i + 1}`)) },
    { title: 'Semifinals', matches: [8, 20].map((row, i) => match(row, 4, `Semifinal ${i + 1}`)) },
    { title: 'Championship', matches: [match(14, 8, 'Championship final')] },
  ];
}

const parseTab = {
  roster: rows => numberedRows(rows.slice(4), 4),
  races: rows => numberedRows(rows.slice(4), 9),
  standings: rows => numberedRows(rows.slice(4), 7),
  bracket: parseBracket,
};

export async function loadResults(onTab) {
  const request = new AbortController();
  const timer = setTimeout(() => request.abort(), 8000);
  try {
    const results = await Promise.allSettled(Object.entries(tabs).map(async ([key, tab]) => {
      const rows = await readTab(tab, request.signal);
      onTab(key, parseTab[key](rows));
    }));
    const received = results.filter(result => result.status === 'fulfilled').length;
    return { received, complete: received === results.length };
  } finally {
    clearTimeout(timer);
    request.abort();
  }
}
