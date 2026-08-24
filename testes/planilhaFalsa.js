/* Emulador dos serviços do Google que o Codigo.gs usa.
   Reproduz de propósito as REGRAS do Apps Script (não só as assinaturas),
   para que um teste local falhe pelos mesmos motivos que o Google falharia. */
const fs = require('fs');
const path = require('path');
const RAIZ = path.join(__dirname, '..');          // raiz do projeto

function criarAmbiente(opcoes) {
  opcoes = opcoes || {};
  const MAX_LINHAS = 1000;
  const abas = {};          // nome -> objeto de aba (com .grade acessível ao teste)

  function novaAba(nome) {
    const grade = [];       // matriz esparsa de valores
    const formatos = {};

    const aba = {
      grade,
      formatos,
      getName: () => nome,

      getLastRow() {
        let ultima = 0;
        grade.forEach((linha, i) => {
          if (linha && linha.some(v => v !== '' && v != null)) ultima = i + 1;
        });
        return ultima;
      },

      getLastColumn() {
        let ultima = 0;
        grade.forEach(linha => {
          if (!linha) return;
          for (let c = linha.length - 1; c >= 0; c--) {
            if (linha[c] !== '' && linha[c] != null) { ultima = Math.max(ultima, c + 1); break; }
          }
        });
        return ultima;
      },

      getMaxRows: () => MAX_LINHAS,
      setFrozenRows: () => aba,
      setColumnWidth: () => aba,

      getRange(linha, col, nLinhas, nCols) {
        nLinhas = nLinhas || 1;
        nCols = nCols || 1;
        const intervalo = {
          setValues(vals) {
            vals.forEach((l, i) => {
              const r = linha + i - 1;
              grade[r] = grade[r] || [];
              l.forEach((v, j) => { grade[r][col + j - 1] = v; });
            });
            return intervalo;
          },
          setValue(v) { return intervalo.setValues([[v]]); },
          getValues() {
            const saida = [];
            for (let i = 0; i < nLinhas; i++) {
              const r = grade[linha + i - 1] || [];
              const l = [];
              for (let j = 0; j < nCols; j++) {
                l.push(r[col + j - 1] === undefined ? '' : r[col + j - 1]);
              }
              saida.push(l);
            }
            return saida;
          },
          getValue() { return intervalo.getValues()[0][0]; },
          setFontWeight: () => intervalo,
          setNumberFormat(f) {
            for (let j = 0; j < nCols; j++) formatos[col + j] = f;
            return intervalo;
          }
        };
        return intervalo;
      },

      appendRow(valores) { grade[aba.getLastRow()] = valores.slice(); },
      deleteRow(linha) { grade.splice(linha - 1, 1); },
      deleteRows(linha, quantas) { grade.splice(linha - 1, quantas); }
    };
    return aba;
  }

  const ss = {
    getSheetByName: n => abas[n] || null,
    insertSheet(n) {
      if (!abas[n]) abas[n] = novaAba(n);
      return abas[n];
    },
    getSheets: () => Object.keys(abas).map(n => abas[n])
  };

  global.SpreadsheetApp = { getActiveSpreadsheet: () => ss, openById: () => ss };

  /* --- Data/hora ---
     `agora` fixa o relógio, para os testes de semana serem determinísticos. */
  let relogio = opcoes.agora || new Date('2026-08-24T10:00:00');
  global.__setAgora = d => { relogio = d; };

  const OriginalDate = Date;
  global.Date = class extends OriginalDate {
    constructor(...args) {
      if (args.length === 0) super(relogio.getTime());
      else super(...args);
    }
    static now() { return relogio.getTime(); }
  };

  global.Session = { getScriptTimeZone: () => 'America/Sao_Paulo' };

  global.Utilities = {
    // UUID de verdade e aleatorio no comeco, como o do Apps Script
    getUuid: () => {
      const hex = n => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join('');
      return [hex(8), hex(4), hex(4), hex(4), hex(12)].join('-');
    },
    formatDate: (d, tz, padrao) => {
      const p = n => String(n).padStart(2, '0');
      return padrao
        .replace(/yyyy/g, d.getFullYear())
        .replace(/MM/g, p(d.getMonth() + 1))
        .replace(/dd/g, p(d.getDate()))
        .replace(/HH/g, p(d.getHours()))
        .replace(/mm/g, p(d.getMinutes()));
    }
  };

  global.LockService = {
    getScriptLock: () => ({ tryLock: () => true, releaseLock: () => { } })
  };

  global.Logger = { log: (...a) => console.log('   [log]', ...a) };

  /* --- ContentService ---
     É por aqui que a API devolve JSON. */
  global.ContentService = {
    MimeType: { JSON: 'application/json', TEXT: 'text/plain' },
    createTextOutput: texto => {
      const o = {
        _mime: 'text/plain',
        getContent: () => texto,
        getMimeType: () => o._mime,
        setMimeType(m) { o._mime = m; return o; }
      };
      return o;
    }
  };

  /* --- HtmlService ---
     Sobrou só a página de aviso do /exec. O Apps Script aceita apenas
     estas 4 metatags; qualquer outra lança
     "A metatag especificada não é permitida neste contexto". */
  const META_PERMITIDAS = [
    'apple-mobile-web-app-capable', 'google-site-verification',
    'mobile-web-app-capable', 'viewport'
  ];

  function saidaHtml(conteudo) {
    const o = {
      _titulo: '',
      _metas: {},
      getContent: () => conteudo,
      setTitle(t) { o._titulo = t; return o; },
      addMetaTag(nome, valor) {
        if (META_PERMITIDAS.indexOf(nome) < 0) {
          throw new Error('A metatag especificada não é permitida neste contexto.');
        }
        o._metas[nome] = valor;
        return o;
      }
    };
    return o;
  }

  global.HtmlService = { createHtmlOutput: saidaHtml };

  return { abas, ss };
}

module.exports = { criarAmbiente };
