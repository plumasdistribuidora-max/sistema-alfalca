// La cara de Claudia: un robot blanco con detalles en verde salvia, que saluda, sobre gris grafito. Imagen hecha con
// Higgsfield (Marketing Studio Image) en public/claudia: robot.jpg para el botón y la barra,
// robot-grande.jpg para el saludo del chat. Mientras piensa, un anillo late alrededor.

export default function AvatarClaudia({ tamano = 56, pensando = false, grande = false, className = '' }) {
  return (
    <span className={`relative inline-block shrink-0 ${className}`} style={{ width: tamano, height: tamano }}>
      {pensando && <span className="absolute inset-0 rounded-full ring-2 ring-white/70 animate-ping" aria-hidden="true" />}
      <span className="absolute inset-0 rounded-full overflow-hidden bg-[#55585c]">
        <img
          src={grande ? '/claudia/robot-grande.jpg' : '/claudia/robot.jpg'}
          alt=""
          aria-hidden="true"
          draggable="false"
          className="w-full h-full object-cover"
        />
      </span>
    </span>
  );
}
