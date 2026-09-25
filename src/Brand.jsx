import mark from "./assets/soma-mark.svg";

export default function Brand({ href = "/" }) {
  return <a className="brand" href={href}><img src={mark} alt="" /><span>SOMA</span></a>;
}
