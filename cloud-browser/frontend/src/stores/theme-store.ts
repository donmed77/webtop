import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';


interface IThemeStore {
    theme: 'light' | 'dark';
    toggleTheme: () => void;
}

const useThemeStore = create(
  persist<IThemeStore>(
    (set) => ({
      theme: 'dark', // Default theme
      toggleTheme: () => set((state:any) => ({ theme: state.theme === 'light' ? 'dark' : 'light' })),
    }),
    {
      name: 'theme-storage',
      storage: createJSONStorage(() => localStorage),
    }
  )
);

export default useThemeStore;
