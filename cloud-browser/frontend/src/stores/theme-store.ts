// Dark mode only — no toggle, no persistence needed
const useThemeStore = () => ({ theme: 'dark' as const });

export default useThemeStore;
