import {
  Box,
  Grid,
} from "@mui/material";
import Image from "next/image";
import CallToAction from "./CallToAction";
import { useTranslations } from "next-intl";

const LOGOS = [
  { src: "/images/Cuttly.png", alt: "Cuttly logo", width: 137, height: 60 },
  { src: "/images/Bitly.png", alt: "Bitly logo", width: 111, height: 60 },
  { src: "/images/Buffer.png", alt: "Buffer logo", width: 160, height: 60 },
  { src: "/images/Shortio.png", alt: "Short.io logo", width: 160, height: 60 },
  { src: "/images/Rebrandly.png", alt: "Rebrandly logo", width: 160, height: 60 },
  { src: "/images/Tinyurl.png", alt: "Tinyurl logo", width: 160, height: 60 },
] as const;

const Hero = ({link, scrapeId, data}:{link?:string, scrapeId?:number, data?:any}) => {
 

  const t = useTranslations('home.hero');

  
  return (
    <section>
      <div className="flex flex-col justify-center items-center">
    

        <Grid
          className="place-items-start mb-4"
          container
          rowSpacing={{ xs: 2, sm: 2, md: 3 }}
          columnSpacing={{ xs: 0, sm: 0, md: 0 }}
        >
          <Grid
            size={{
              xs: 12,
              sm: 12,
              md: 12,
              lg: 6.5
            }}>
            <div className="w-full flex flex-col gap-1 md:gap-2 justify-center sm:mt-8 xl:mt-20">
              <h1 className="text-primary-purple dark:text-primary-purple-light font-bold text-[22px]">
                {t('wheregoes')}
              </h1>
              <h2 className="flex flex-col md:text-[60px] font-extrabold md:leading-[72px]  text-[50px] leading-[60px]">
                {t('title')}
              </h2>
              <p className=" py-4 font-normal text-[18px] leading-[30px] mt-2 md:mt-3 dark:opacity-80">
                {t('description')}
              </p>

              <CallToAction link={link} scrapeId={scrapeId} dataIsShare={data}/>
            </div>
          </Grid>
          <Grid
            className="flex !items-center !justify-center"
            size={{
              xs: 12,
              sm: 12,
              md: 12,
              lg: 5.5
            }}>
            <Box
              className="mt-8 md:mt-0"
              sx={{
                width: { md: "100%", sm: "100%", xs: "100%" }
              }}
            >
              <div className="flex justify-center items-center">
                <Image
                  src="/images/Unshortlink-Background.png"
                  alt="Unshorten URL"
                  width={800}
                  height={800}
                  priority
                  fetchPriority="high"
                  sizes="(min-width: 1024px) 45vw, 100vw"
                />
              </div>
            </Box>
          </Grid>
        </Grid>


        <ul
          aria-label="Supported short link providers"
          className="grid w-full max-w-[1280px] grid-cols-2 place-items-center gap-x-6 gap-y-6 pt-16 opacity-40 dark:opacity-50 md:grid-cols-3 md:gap-x-10 md:gap-y-8 xl:grid-cols-6 xl:gap-x-16 xl:gap-y-12"
        >
          {LOGOS.map((logo) => (
            <li key={logo.src} className="flex shrink-0 items-center justify-center">
              <Image
                src={logo.src}
                alt={logo.alt}
                width={logo.width}
                height={logo.height}
                sizes="160px"
                loading="lazy"
                className="h-12 w-auto max-w-none shrink-0 dark:contrast-0"
              />
            </li>
          ))}
        </ul>
        </div>
    </section>
  );
};

export default Hero;
