const cop = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const entero = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });

export const money = (value) => cop.format(Number(value) || 0);
/** Como money, pero un importe ausente se ve como ausente y no como $0. */
export const moneyOrDash = (value) => (value === null || value === undefined ? "—" : money(value));
export const number = (value) => entero.format(Number(value) || 0);
