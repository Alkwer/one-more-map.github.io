try {
  localStorage.setItem('theme', 'harvest')
} catch {
  // A blocked storage API should not prevent the redirect.
}
location.replace('./')
