import logo from '../assets/logo.svg';

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-6">
      <img src={logo} alt="ALFALCA" className="w-24 h-24" />
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-bold text-stone-900">Sistema ALFALCA</h1>
        <p className="text-stone-500">Elegí una opción del menú para empezar</p>
      </div>
    </div>
  );
}
