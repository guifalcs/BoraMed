export function currentWeekRange(): string {
  const now = new Date();
  const dow = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const month = (date: Date) =>
    date.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');

  if (monday.getMonth() === sunday.getMonth()) {
    return `${monday.getDate()}–${sunday.getDate()} de ${month(monday)}`;
  }

  return `${monday.getDate()} ${month(monday)} – ${sunday.getDate()} ${month(sunday)}`;
}
