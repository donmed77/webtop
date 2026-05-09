"use client";

import Navbar from "@/components/home/Navbar";
import { useEffect, useMemo } from "react";
import { ThemeProvider, createTheme } from '@mui/material/styles';
import Footer from "@/components/home/Footer";

const LandingLayoutWrapper = ({ children }: { children: React.ReactNode }) => {
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
          mode: 'dark',
          primary: { main: '#a97dff' },
        },
        breakpoints: {
          values: { xs: 0, sm: 640, md: 768, lg: 1024, xl: 1280 },
        },
        components: {
          MuiTextField: {
            styleOverrides: {
              root: {
                "& .MuiOutlinedInput-root": {
                  color: '#fff',
                  borderRadius: "0",
                  "& .MuiOutlinedInput-notchedOutline": {
                    borderColor: "#353535",
                    borderWidth: "2px",
                  },
                  "&.Mui-focused": {
                    "& .MuiOutlinedInput-notchedOutline": {
                      borderColor: '#a97dff',
                      borderWidth: "2px",
                    },
                  },
                  "&:hover:not(.Mui-focused)": {
                    "& .MuiOutlinedInput-notchedOutline": {
                      borderColor: "#353535",
                    },
                  },
                },
                "& .MuiInputLabel-outlined": {
                  "&.Mui-focused": {
                    color: '#a97dff',
                  },
                },
              },
            },
          },
          MuiPopover: {
            styleOverrides: {
              paper: {
                boxShadow: 'none',
                border: '2px solid #353535',
                borderRadius: '0',
              },
            },
          },
          MuiDrawer: {
            styleOverrides: { paper: { boxShadow: 'none' } },
          },
        },
      }),
    [],
  );

  useEffect(() => {
    document.documentElement.classList.add('dark');
  }, []);

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
