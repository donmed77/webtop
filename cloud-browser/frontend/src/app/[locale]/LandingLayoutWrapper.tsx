"use client";

import Navbar from "@/components/home/Navbar";
import { useEffect, useMemo } from "react";
import { ThemeProvider, createTheme } from '@mui/material/styles';
import Footer from "@/components/home/Footer";
import useThemeStore from "@/stores/theme-store";

const LandingLayoutWrapper = ({ children }: { children: React.ReactNode }) => {
  const { theme: mode } = useThemeStore();

  const theme = useMemo(
    () =>
      createTheme({
        typography: {
          button: { textTransform: 'none' },
          allVariants: {
            fontFamily: "var(--poppins)",
            textTransform: 'none',
            fontSize: 16,
          },
        },
        palette: {
          mode,
          primary: { main: mode == 'dark' ? '#a97dff' : '#8437fe' },
        },
        breakpoints: {
          values: { xs: 0, sm: 640, md: 768, lg: 1024, xl: 1280 },
        },
        components: {
          MuiTextField: {
            styleOverrides: {
              root: {
                "& .MuiOutlinedInput-root": {
                  color: mode == 'dark' ? '#fff' : '#000',
                  borderRadius: "0",
                  "& .MuiOutlinedInput-notchedOutline": {
                    borderColor: mode == 'dark' ? "#353535" : "#EEEEEE",
                    borderWidth: "2px",
                  },
                  "&.Mui-focused": {
                    "& .MuiOutlinedInput-notchedOutline": {
                      borderColor: mode == 'dark' ? '#a97dff' : '#8437fe',
                      borderWidth: "2px",
                    },
                  },
                  "&:hover:not(.Mui-focused)": {
                    "& .MuiOutlinedInput-notchedOutline": {
                      borderColor: mode == 'dark' ? "#353535" : "#EEEEEE",
                    },
                  },
                },
                "& .MuiInputLabel-outlined": {
                  "&.Mui-focused": {
                    color: mode == 'dark' ? '#a97dff' : '#8437fe',
                  },
                },
              },
            },
          },
          MuiPopover: {
            styleOverrides: {
              paper: {
                boxShadow: 'none',
                border: `2px solid ${mode === 'dark' ? '#353535' : '#EEEEEE'}`,
                borderRadius: '0',
              },
            },
          },
          MuiDrawer: {
            styleOverrides: { paper: { boxShadow: 'none' } },
          },
        },
      }),
    [mode],
  );

  useEffect(() => {
    if (mode == 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [mode]);

  return (
    <ThemeProvider theme={theme}>
      <div className="w-full flex flex-col items-center">
        <div className="relative w-full flex flex-col items-center">
          <Navbar />
          <div className="max-w-[1280px] px-3 md:px-6 xl:px-0 pb-[600px] md:pb-[480px]">
            {children}
          </div>
          <Footer />
        </div>
      </div>
    </ThemeProvider>
  );
};

export default LandingLayoutWrapper;
