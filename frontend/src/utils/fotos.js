// Las fotos salen de la cámara del celular a 4000px y 5 MB. Se achican acá para que
// la carga no dependa de la señal que haya en el local.
export function comprimir(file, maxLado = 1600, calidad = 0.8) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const escala = Math.min(1, maxLado / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width  = Math.round(img.width  * escala);
      canvas.height = Math.round(img.height * escala);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        blob => blob ? resolve(new File([blob], 'foto.jpg', { type: 'image/jpeg' })) : reject(new Error('No se pudo procesar la foto')),
        'image/jpeg', calidad
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la foto')); };
    img.src = url;
  });
}

