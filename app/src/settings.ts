const OPT_OUT_KEY = 'localtune:researchOptOut'

export function isResearchOptOut(): boolean {
  return sessionStorage.getItem(OPT_OUT_KEY) === '1'
}

export function setResearchOptOut(optOut: boolean): void {
  sessionStorage.setItem(OPT_OUT_KEY, optOut ? '1' : '0')
}

export function isResearchEnabled(): boolean {
  return !isResearchOptOut()
}
