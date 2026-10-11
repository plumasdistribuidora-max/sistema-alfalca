import { Fragment, useEffect, useState } from 'react';
import api from '../../../api';
import { fmtARS, colorDeTienda, shortName, ordenarTiendas } from '../redUtils';

// "Crecimiento": de dónde viene lo que creció Entre Dos contra los mismos días del año
// pasado. Lo que ya estaba (mismos locales y zonas) va separado de lo que no tiene contra
// qué compararse, y el número que importa es el descontando inflación. Los locales de una misma
// zona (Sheraton con Amigorena) se comparan como uno solo. El Café también suma docenas.

const MES_LARGO = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const NUNITO = { fontFamily: 'Nunito, sans-serif' };

function partes(iso) { const [y, m, d] = iso.split('-').map(Number); return { y, m, d }; }
const diaMes = iso => { const { m, d } = partes(iso); return `${d}/${m}`; };
const doc = v => (Number(v) || 0).toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const pct = v => Math.abs(v).toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

// Crecimiento en %: a contra b. Descontando inflación: la del INDEC.
const crec = (a, b) => (b ? (a / b - 1) * 100 : null);
const real = (a, b, ipc) => (b && ipc != null ? (a / b / (1 + ipc / 100) - 1) * 100 : null);

function Pct({ v, fuerte, claro }) {
  if (v === null || v === undefined) return <span className="text-stone-400">—</span>;
  const color = Math.abs(v) < 0.05 ? 'text-stone-500' : v > 0 ? (claro ? 'text-emerald-300' : 'text-emerald-700') : (claro ? 'text-red-300' : 'text-red-700');
  return <span className={`${color} ${fuerte ? 'font-bold' : 'font-semibold'} tabular-nums whitespace-nowrap`}>{v >= 0 ? '▲' : '▼'} {pct(v)} %</span>;
}

function Chip({ children }) {
  return <span className="text-[10.5px] font-semibold text-ahg-primary bg-ahg-bg rounded-full px-2 py-0.5 whitespace-nowrap">{children}</span>;
}

function Zona({ z, color, chip }) {
  return (
    <span className="inline-flex items-center gap-2 flex-wrap">
      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
      <span className="font-medium text-ahg-text">{z}</span>
      {chip && <Chip>{chip}</Chip>}
    </span>
  );
}

export default function CrecimientoSection() {
  const [modo, setModo]       = useState('anio');
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  useEffect(() => {
    setLoading(true); setError(null);
    api.get('/red/crecimiento', { params: { modo } })
      .then(r => setData(r.data.data))
      .catch(err => setError(err?.response?.data?.error || err.message))
      .finally(() => setLoading(false));
  }, [modo]);

  const seg = activo => `px-3 py-1.5 text-xs font-semibold transition-colors ${activo ? 'bg-ahg-primary text-white' : 'bg-white text-stone-500 hover:bg-stone-50'}`;
  const cabecera = (
    <div className="flex flex-wrap items-center justify-between gap-3 px-1">
      <div className="flex flex-wrap items-baseline gap-2">
        {data && (
          <b className="text-[15px]" style={NUNITO}>
            {data.periodo.modo === 'anio'
              ? `Del 1 de enero al ${partes(data.periodo.hasta).d} de ${MES_LARGO[partes(data.periodo.hasta).m - 1]}`
              : `${MES_LARGO[partes(data.periodo.hasta).m - 1].replace(/^./, c => c.toUpperCase())}, del 1 al ${partes(data.periodo.hasta).d}`}
          </b>
        )}
        <span className="text-xs text-stone-500">contra los mismos días del año pasado, con IVA</span>
      </div>
      <div className="flex rounded-lg border border-stone-200 overflow-hidden">
        <button className={seg(modo === 'mes')} aria-pressed={modo === 'mes'} onClick={() => setModo('mes')}>Este mes</button>
        <button className={seg(modo === 'anio')} aria-pressed={modo === 'anio'} onClick={() => setModo('anio')}>Este año</button>
      </div>
    </div>
  );

  if (loading && !data) {
    return (
      <div className="space-y-4">
        {cabecera}
        <div className="grid sm:grid-cols-3 gap-3">{[1, 2, 3].map(i => <div key={i} className="h-36 bg-stone-200 rounded-2xl animate-pulse" />)}</div>
      </div>
    );
  }
  if (error) return <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">{error}</p>;
  if (!data) return <p className="text-center py-16 text-stone-400">Todavía no hay ventas cargadas.</p>;

  const ipc = data.inflacion?.valor ?? null;
  const anioAnt = partes(data.periodo.anio_ant.hasta).y;

  // Las zonas en el orden de siempre (por el local que le da nombre), el Café al final.
  const orden = ordenarTiendas(data.zonas.map(z => z.nombre));
  const zonas = [...data.zonas].sort((a, b) => orden.indexOf(a.nombre) - orden.indexOf(b.nombre));
  const nombreZona = z => (z.locales.length > 1 ? `Zona ${shortName(z.nombre)}` : shortName(z.nombre));
  const chipZona = z => {
    const otros = z.locales.filter(l => l.id !== z.id).map(l => shortName(l.nombre));
    const partes_ = [];
    if (otros.length) partes_.push(`con ${otros.join(' y ')}`);
    if (z.comparable && z.comparable.desde > data.periodo.desde) partes_.push(`${diaMes(z.comparable.desde)} al ${diaMes(data.periodo.hasta)}`);
    return partes_.join(' · ') || null;
  };

  const cmp = zonas.filter(z => z.comparable);
  const sin = zonas.filter(z => z.sin_comparar);
  const suma = (lista, k, campo) => lista.reduce((a, z) => a + z.comparable[k][campo], 0);
  const cAct = { f: suma(cmp, 'act', 'f'), d: suma(cmp, 'act', 'd') };
  const cAnt = { f: suma(cmp, 'ant', 'f'), d: suma(cmp, 'ant', 'd') };
  const tot = data.total;

  const realCmp  = real(cAct.f, cAnt.f, ipc);
  const realTot  = real(tot.act.f, tot.ant.f, ipc);
  const docCmp   = crec(cAct.d, cAnt.d);
  const docTot   = crec(tot.act.d, tot.ant.d);
  const pesosCmp = crec(cAct.f, cAnt.f);

  // La lectura, armada con los mismos números de la pantalla.
  const ganan  = cmp.filter(z => real(z.comparable.act.f, z.comparable.ant.f, ipc) > 0).map(nombreZona);
  const pierden = cmp.filter(z => real(z.comparable.act.f, z.comparable.ant.f, ipc) <= 0).map(nombreZona);
  const lista = xs => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} y ${xs.at(-1)}` : xs[0]);
  const lectura = [];
  if (realCmp !== null) {
    lectura.push(<>Lo que ya estaba <b>{realCmp >= 0 ? 'le ganó' : 'perdió'} {pct(realCmp)} %</b> contra la inflación ({pesosCmp >= 0 ? 'creció' : 'cayó'} {pct(pesosCmp)} % en pesos, con una inflación de {pct(ipc)} %).
      {docCmp !== null && <> En docenas, vende <b>{pct(docCmp)} % {docCmp >= 0 ? 'más' : 'menos'}</b>.</>}</>);
    if (ganan.length && pierden.length) lectura.push(<>Le ganan a la inflación {lista(ganan)}. Quedan abajo {lista(pierden)}.</>);
    else if (ganan.length) lectura.push(<>Todas las zonas le ganan a la inflación.</>);
    else lectura.push(<>Ninguna zona le gana a la inflación.</>);
  }
  if (sin.length && realTot !== null) {
    lectura.push(<>Con lo que no tiene contra qué compararse, Entre Dos en total {realTot >= 0 ? 'crece' : 'cae'} <b>{pct(realTot)} % descontando inflación</b>
      {docTot !== null && <> y vende <b>{pct(docTot)} % {docTot >= 0 ? 'más' : 'menos'} docenas</b></>}.</>);
  }

  // Una tabla con el mismo armado para pesos y para docenas.
  const Tabla = ({ campo }) => {
    const pesos = campo === 'f';
    const fmt = pesos ? fmtARS : doc;
    const th = 'text-[11px] font-semibold text-stone-500 text-right px-3 py-2 border-b border-stone-200 whitespace-nowrap';
    const td = 'px-3 py-2.5 text-right tabular-nums whitespace-nowrap border-b border-stone-100';
    const tdL = 'px-3 py-2.5 text-left whitespace-nowrap border-b border-stone-100';
    const realCol = 'bg-[#f1efe9] font-bold';
    const seccion = titulo => (
      <tr><td colSpan={pesos ? 4 : 5} className="px-3 pt-4 pb-1 text-[11px] font-bold uppercase tracking-wider text-stone-500">{titulo}</td>{pesos && <td className={realCol} />}</tr>
    );
    return (
      <div className="overflow-x-auto mt-3">
        <table className="w-full text-[13.5px] min-w-[640px]">
          <thead>
            <tr>
              <th className={th.replace('text-right', 'text-left')}>Zona</th>
              <th className={th}>{anioAnt}</th>
              <th className={th}>{anioAnt + 1}</th>
              {pesos ? <th className={th}>En pesos</th> : <th className={th}>Diferencia</th>}
              {pesos ? <th className={`${th} ${realCol} text-ahg-text`}>Descontando inflación</th> : <th className={th}>Creció</th>}
            </tr>
          </thead>
          <tbody>
            {seccion('Lo que ya estaba')}
            {cmp.map(z => {
              const a = z.comparable.act[campo], b = z.comparable.ant[campo];
              return (
                <Fragment key={z.id}>
                  <tr>
                    <td className={tdL}><Zona z={nombreZona(z)} color={colorDeTienda(z.nombre)} chip={chipZona(z)} /></td>
                    <td className={td}>{b ? fmt(b) : '—'}</td>
                    <td className={td}>{fmt(a)}</td>
                    {pesos ? <td className={td}><Pct v={crec(a, b)} /></td> : <td className={td}>{a - b >= 0 ? '+' : '−'} {fmt(Math.abs(a - b))}</td>}
                    {pesos ? <td className={`${td} ${realCol}`}><Pct v={real(a, b, ipc)} fuerte /></td> : <td className={td}><Pct v={crec(a, b)} /></td>}
                  </tr>
                  {z.locales.length > 1 && z.comparable.locales.map(l => (
                    <tr key={l.id} className="text-[12px] text-stone-500">
                      <td className="pl-9 pr-3 py-1 text-left">{shortName(l.nombre)}{l.ant[campo] ? '' : ` (desde ${l.primera_venta ? diaMes(l.primera_venta) + '/' + l.primera_venta.slice(2, 4) : '—'})`}</td>
                      <td className="px-3 py-1 text-right tabular-nums">{l.ant[campo] ? fmt(l.ant[campo]) : '—'}</td>
                      <td className="px-3 py-1 text-right tabular-nums">{fmt(l.act[campo])}</td>
                      <td className="px-3 py-1 text-right">{pesos ? (l.ant[campo] ? <Pct v={crec(l.act[campo], l.ant[campo])} /> : '') : `${l.act[campo] - l.ant[campo] >= 0 ? '+' : '−'} ${fmt(Math.abs(l.act[campo] - l.ant[campo]))}`}</td>
                      <td className={`px-3 py-1 text-right ${pesos ? 'bg-[#f1efe9]' : ''}`}>{!pesos && l.ant[campo] ? <Pct v={crec(l.act[campo], l.ant[campo])} /> : ''}</td>
                    </tr>
                  ))}
                </Fragment>
              );
            })}
            <tr className="bg-[#f6f5f2] font-bold">
              <td className={tdL}>Mismos locales y zonas</td>
              <td className={td}>{fmt(cAnt[campo])}</td>
              <td className={td}>{fmt(cAct[campo])}</td>
              {pesos ? <td className={td}><Pct v={crec(cAct[campo], cAnt[campo])} /></td> : <td className={td}>{cAct[campo] - cAnt[campo] >= 0 ? '+' : '−'} {fmt(Math.abs(cAct[campo] - cAnt[campo]))}</td>}
              {pesos ? <td className={`${td} bg-[#e6e4de]`}><Pct v={realCmp} fuerte /></td> : <td className={td}><Pct v={docCmp} fuerte /></td>}
            </tr>
            {sin.length > 0 && seccion(`Sin ${anioAnt} para comparar`)}
            {sin.map(z => (
              <tr key={z.id}>
                <td className={tdL}><Zona z={nombreZona(z)} color={colorDeTienda(z.nombre)} chip={`${diaMes(z.sin_comparar.desde)} al ${diaMes(z.sin_comparar.hasta)}`} /></td>
                <td className={`${td} italic text-stone-400`}>sin ventas en {anioAnt}</td>
                <td className={td}>{fmt(z.sin_comparar[campo])}</td>
                <td className={`${td} text-stone-400`}>{pesos ? '—' : `+ ${fmt(z.sin_comparar[campo])}`}</td>
                <td className={`${td} text-stone-400 ${pesos ? realCol.replace('font-bold', '') : ''}`}>—</td>
              </tr>
            ))}
            <tr className="font-bold border-t-2 border-ahg-primary bg-[#f6f5f2]">
              <td className="px-3 py-2.5 text-left">Entre Dos total</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{fmt(tot.ant[campo])}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{fmt(tot.act[campo])}</td>
              {pesos ? <td className="px-3 py-2.5 text-right"><Pct v={crec(tot.act.f, tot.ant.f)} /></td> : <td className="px-3 py-2.5 text-right tabular-nums">{tot.act.d - tot.ant.d >= 0 ? '+' : '−'} {doc(Math.abs(tot.act.d - tot.ant.d))}</td>}
              {pesos ? <td className="px-3 py-2.5 text-right bg-[#e6e4de]"><Pct v={realTot} fuerte /></td> : <td className="px-3 py-2.5 text-right"><Pct v={docTot} fuerte /></td>}
            </tr>
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {cabecera}

      {/* ── El número al que se quiere llegar ─────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
        <div className="lg:col-span-3 rounded-2xl bg-ahg-primary text-white px-6 py-5">
          <p className="text-[13px] text-white/65">Lo que ya estaba, descontada la inflación</p>
          {realCmp !== null ? <>
            <p className={`text-5xl font-extrabold tracking-tight mt-1 tabular-nums ${realCmp >= 0 ? 'text-emerald-300' : 'text-red-300'}`} style={NUNITO}>
              {realCmp >= 0 ? '▲' : '▼'} {pct(realCmp)} %
            </p>
            <p className="text-[13px] text-white/80 mt-2 leading-relaxed">
              Mismos locales y zonas {pesosCmp >= 0 ? 'crecieron' : 'cayeron'} <b className="text-white">{pct(pesosCmp)} %</b> en pesos, contra una inflación de <b className="text-white">{pct(ipc)} %</b>.<br />
              Para crecer de verdad, este número tiene que estar arriba de cero.
            </p>
          </> : <p className="text-sm text-white/80 mt-2">Falta cargar la inflación: se carga al pie de <em>Cómo venimos</em>.</p>}
        </div>
        <div className="lg:col-span-2 grid gap-3">
          <div className="card px-5 py-4">
            <p className="text-xs text-stone-500">En docenas, lo que ya estaba</p>
            <p className="text-2xl font-extrabold mt-0.5" style={NUNITO}><Pct v={docCmp} /></p>
            <p className="text-xs text-stone-500">{doc(cAnt.d)} → {doc(cAct.d)}</p>
          </div>
          <div className="card px-5 py-4">
            <p className="text-xs text-stone-500">Entre Dos total, descontando inflación</p>
            <p className="text-2xl font-extrabold mt-0.5" style={NUNITO}><Pct v={realTot} /></p>
            <p className="text-xs text-stone-500">En pesos <Pct v={crec(tot.act.f, tot.ant.f)} />{sin.length ? ', con lo que no se compara' : ''}</p>
          </div>
        </div>
      </div>

      <div className="card px-5 py-4">
        <p className="font-bold text-ahg-text text-[17px]" style={NUNITO}>De dónde viene el crecimiento</p>
        <p className="text-[12.5px] text-stone-500 mt-0.5">En pesos, con IVA. La última columna es la que importa.</p>
        <Tabla campo="f" />
        <p className="text-[11.5px] text-stone-500 mt-3">
          Descontando inflación: lo que creció en pesos, descontado el {ipc != null ? `${pct(ipc)} %` : '—'} interanual del INDEC{data.inflacion?.mes ? ` (${MES_LARGO[Number(data.inflacion.mes.slice(5)) - 1]})` : ''}, el mismo dato que se carga en <em>Cómo venimos</em>.
        </p>
      </div>

      <div className="card px-5 py-4">
        <p className="font-bold text-ahg-text text-[17px]" style={NUNITO}>En docenas</p>
        <p className="text-[12.5px] text-stone-500 mt-0.5">La cantidad que se vende, sin el efecto del precio. Tiendas y Café.</p>
        <Tabla campo="d" />
      </div>

      {lectura.length > 0 && (
        <div className="card px-5 py-4">
          <p className="font-bold text-ahg-text text-[17px]" style={NUNITO}>La lectura</p>
          <ul className="mt-2 space-y-1.5 list-disc pl-5 text-sm text-ahg-text leading-relaxed">
            {lectura.map((l, i) => <li key={i}>{l}</li>)}
          </ul>
        </div>
      )}

      <p className="text-[11.5px] text-stone-500 px-1">
        Los locales de una misma zona se comparan juntos (se arma en <em>Locales</em>). Cada zona se compara en todo el período, año contra año. Solo un local que el año pasado todavía no estaba abierto en esos días (le faltan más de 45) se compara desde que abrió, y lo de antes va a «sin {anioAnt} para comparar».
      </p>
    </div>
  );
}
