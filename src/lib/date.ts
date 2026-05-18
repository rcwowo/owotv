const ordinal = (day: number) => {
  const mod100 = day % 100
  if (mod100 >= 11 && mod100 <= 13) return `${day}th`
  switch (day % 10) {
    case 1:
      return `${day}st`
    case 2:
      return `${day}nd`
    case 3:
      return `${day}rd`
    default:
      return `${day}th`
  }
}

export const formatStreamDate = (date: Date) => {
  const month = date.toLocaleDateString('en-US', { month: 'long' })
  const day = ordinal(date.getDate())
  const year = date.getFullYear()
  return `${month} ${day}, ${year}`
}
