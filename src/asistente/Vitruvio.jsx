// Cara del Asesor SOMA: un hombre de Vitruvio en silueta, dibujado aqui (no es
// una imagen de terceros; los trazos salen de scratchpad, miembros ahusados con
// las proporciones de Leonardo: el ombligo es el centro del circulo). La pose
// alterna (brazos alzados, piernas abiertas) va tenue detras. El brazo derecho
// saluda hacia la burbuja del lanzador (portada.css); con prefers-reduced-motion
// se queda quieto.
export default function Vitruvio({ size = 40, className = "" }) {
  return <svg className={`vitruvio ${className}`} viewBox="0 0 48 48" width={size} height={size} aria-hidden="true">
    <circle className="vitruvio-circulo" cx="24" cy="23.2" r="19.8" />
    <rect className="vitruvio-cuadro" x="8.2" y="10.6" width="31.6" height="31.8" />
    <g className="vitruvio-eco"><path d="M21.6 17.69L16.17 14.61L9.94 11.02A0.45 0.45 0 0 0 9.46 11.78L15.43 15.79L20.6 19.31Z" /><path d="M27.4 19.31L32.57 15.79L38.54 11.78A0.45 0.45 0 0 0 38.06 11.02L31.83 14.61L26.4 17.69Z" /><path d="M21.48 28.15L19.88 34.8L18.17 42.18A0.45 0.45 0 0 0 19.03 42.42L21.32 35.2L23.32 28.65Z" /><path d="M24.68 28.65L26.68 35.2L28.97 42.42A0.45 0.45 0 0 0 29.83 42.18L28.12 34.8L26.52 28.15Z" /></g>
    <g className="vitruvio-cuerpo"><ellipse cx="24" cy="14" rx="2.1" ry="2.55" /><path d="M23.1 16.2h1.8v1.6h-1.8z" /><path d="M20.1 18.9C20.8 17.9 22.2 17.5 24 17.5S27.2 17.9 27.9 18.9C27.6 20.6 27.1 22.4 26.6 24.2C26.8 25.3 27.1 26.4 27.1 27.6C26.2 28.4 25 28.7 24 28.7S21.8 28.4 20.9 27.6C20.9 26.4 21.2 25.3 21.4 24.2C20.9 22.4 20.4 20.6 20.1 18.9Z" /><path d="M21.2 17.25L18.52 17.25L15.77 17.65L13.37 17.7L10.57 18.08L9.55 18.23A0.47 0.47 0 0 0 9.65 19.17L10.63 19.12L13.43 19.3L15.83 19.15L18.48 19.35L21 19.75Z" /><path d="M21 27.64L21.35 31.27L22.08 34.62L21.83 36.82L22.48 40.03L22.58 42.41A0.53 0.53 0 0 0 23.62 42.39L23.62 39.97L23.87 36.78L23.82 34.58L24.05 31.13L24.2 27.56Z" /><path d="M23.8 27.56L23.95 31.13L24.18 34.58L24.13 36.78L24.38 39.97L24.38 42.39A0.53 0.53 0 0 0 25.42 42.41L25.52 40.03L26.17 36.82L25.92 34.62L26.65 31.27L27 27.64Z" /></g>
    <g className="vitruvio-brazo vitruvio-cuerpo"><path d="M27 19.75L29.52 19.35L32.17 19.15L34.57 19.3L37.37 19.12L38.35 19.17A0.47 0.47 0 0 0 38.45 18.23L37.43 18.08L34.63 17.7L32.23 17.65L29.48 17.25L26.8 17.25Z" /><circle className="vitruvio-mano" cx="38.8" cy="18.7" r="1.15" /></g>
  </svg>;
}
