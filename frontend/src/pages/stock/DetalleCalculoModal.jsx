import { useEffect } from 'react';

// El desglose de una variedad: de la venta del grupo al número de bultos que se le
// pide a Entre Dos, paso por paso y con los números de esta pantalla. Se abre al
// tocar la fila, para contestar "¿de dónde salió que tengo que pedir 7 bultos?".

const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const SITUACIONES = { normal: 'Normal', sube: 'Sube', finde_largo: 'Finde largo' };

const doc = v => (Number(v) || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// El cociente en bultos se muestra con más decimales: 66,01 ÷ 6 da 11,0017, y
// redondeado a dos decimales se leería "11,00 → 12 bultos", que parece un error.
const bult = v => (Number(v) || 0).toLocaleString('es-AR', { maximumFractionDigits: 3 });

function Paso({ n, titulo, cuenta, resultado, nota, tono = 'normal' }) {
  const colores = {
    normal: 'text-stone-800',
    final:  'text-violet-800',
    corte:  'text-emerald-700',
  }[tono];

  return (
    <div className="flex gap-3 py-2.5 border-b border-stone-100 last:border-0">
      <span className="flex-none w-6 h-6 rounded-full bg-stone-100 text-stone-500 text-xs font-bold flex items-center justify-center mt-0.5">
        {n}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-stone-800">{titulo}</p>
        {cuenta && <p className="text-xs text-stone-400 tabular-nums mt-0.5">{cuenta}</p>}
        {nota && <p className="text-xs text-stone-400 mt-0.5">{nota}</p>}
      </div>
      <div className={`flex-none text-right font-bold tabular-nums ${colores}`} style={{ fontFamily: 'Nunito, sans-serif' }}>
        {resultado}
      </div>
    </div>
  );
}

export default function DetalleCalculoModal({ fila, proyeccion, dias, situacion, onClose }) {
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const f = proyeccion.factores;
  const p = proyeccion.parametros;

  const semanal    = f.velocidad_base_semanal;
  const porDias    = semanal * (dias / 7);
  const conEstacion = porDias * f.factor_estacional;
  const conTendencia = conEstacion * f.factor_tendencia;
  const total      = conTendencia * f.multiplicador;
  const delSabor   = total * fila.mix_pct / 100;
  const aPedirDoc  = Math.max(0, delSabor - fila.stock_doc);
  const bultosCrudo = fila.doc_por_bulto > 0 ? aPedirDoc / fila.doc_por_bulto : 0;

  const sobra = delSabor <= fila.stock_doc;

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-stone-100 flex items-start justify-between flex-shrink-0">
          <div>
            <h3 className="font-bold text-stone-900 text-lg" style={{ fontFamily: 'Nunito, sans-serif' }}>
              {fila.nombre}
            </h3>
            <p className="text-xs text-stone-400 mt-0.5">
              Cómo se llegó a {sobra ? 'que no hay que pedir' : `${fila.a_pedir_bultos} bulto${fila.a_pedir_bultos === 1 ? '' : 's'}`}
            </p>
          </div>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600 text-xl leading-none">×</button>
        </div>

        <div className="px-6 py-2 overflow-y-auto">
          <Paso
            n="1"
            titulo="Lo que vende el grupo por semana"
            cuenta={`Promedio de las últimas ${f.semanas_historia} semanas de las ${proyeccion.grupo.cantidad} tiendas, dándole más peso a las recientes`}
            resultado={`${doc(semanal)} doc`}
          />
          <Paso
            n="2"
            titulo={`Estirado a los ${dias} días que querés cubrir`}
            cuenta={`${doc(semanal)} ÷ 7 × ${dias}`}
            resultado={`${doc(porDias)} doc`}
          />
          <Paso
            n="3"
            titulo="Ajuste por temporada"
            cuenta={`× ${f.factor_estacional}`}
            nota={`De ${MESES[p.mes_actual - 1]} (índice ${f.indice_mes_actual}) a ${MESES[p.mes_objetivo - 1]} (índice ${f.indice_mes_objetivo})`}
            resultado={`${doc(conEstacion)} doc`}
          />
          <Paso
            n="4"
            titulo="Caída del consumo"
            cuenta={`× ${f.factor_tendencia}`}
            nota="El mercado viene cayendo, así que se pide un poco menos de lo que dice la cuenta"
            resultado={`${doc(conTendencia)} doc`}
          />
          <Paso
            n="5"
            titulo={`Situación: ${SITUACIONES[situacion] || situacion}`}
            cuenta={`× ${f.multiplicador}`}
            resultado={`${doc(total)} doc`}
            tono="final"
          />
          <Paso
            n="6"
            titulo={`De todo eso, este sabor es el ${fila.mix_pct}%`}
            cuenta={`${doc(total)} × ${fila.mix_pct}%`}
            resultado={`${doc(delSabor)} doc`}
          />
          <Paso
            n="7"
            titulo="Menos lo que ya tenés contado"
            cuenta={`${doc(delSabor)} − ${doc(fila.stock_doc)}`}
            resultado={sobra ? '0 doc' : `${doc(aPedirDoc)} doc`}
            tono="corte"
          />
          {!sobra && (
            <Paso
              n="8"
              titulo="Pasado a bultos, para arriba"
              cuenta={`${doc(aPedirDoc)} ÷ ${fila.doc_por_bulto} doc por bulto = ${bult(bultosCrudo)}`}
              nota="Al proveedor se le pide de a bultos enteros, y siempre se redondea para arriba"
              resultado={`${fila.a_pedir_bultos} bulto${fila.a_pedir_bultos === 1 ? '' : 's'}`}
              tono="final"
            />
          )}
        </div>

        <div className="px-6 py-4 border-t border-stone-100 flex-shrink-0">
          {sobra ? (
            <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5">
              Con {doc(fila.stock_doc)} docenas en la calle ya estás cubierto para estos {dias} días.
              No hace falta pedir.
            </p>
          ) : (
            <p className="text-sm text-stone-600 bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5">
              <strong>{doc(aPedirDoc)} docenas</strong> es lo que falta, y como el bulto es de{' '}
              {fila.doc_por_bulto} docenas, el pedido queda en{' '}
              <strong>{fila.a_pedir_bultos} bulto{fila.a_pedir_bultos === 1 ? '' : 's'}</strong>
              {bultosCrudo % 1 !== 0 && (
                <> — te van a llegar {doc(fila.a_pedir_bultos * fila.doc_por_bulto - aPedirDoc)} docenas de más</>
              )}.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
