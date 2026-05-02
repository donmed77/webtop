import { Box, Grid } from '@mui/material'
import { useTranslations } from 'next-intl';

const Stats = () => {

  const t = useTranslations('home.stats');

  return (
    <section className='w-full flex flex-col items-center gap-8 md:gap-16'>
      <Box className='flex flex-col text-[35px] leading-[45px] md:leading-[50px]  md:text-[40px] font-extrabold text-center' sx={{
        width: {md:'60%', sm:'70%', xs:'90%'}
      }}>
        <h2>{t('title')}</h2>
      </Box>
      <Box sx={{ width: '100%' }}>
      <Grid  container rowSpacing={{ xs: 2, sm: 2, md: 3 }} className='place-content-center'>
            <Grid
              className="flex items-center justify-center"
              size={{
                xs: 12,
                sm: 12,
                md: 4
              }}>
            <Box className="mt-8 md:mt-0" sx={{
              width: {md:'90%', sm:'100%', xs:'100%'}
            }}>
              <div className="flex justify-center items-center  ">
                <img src="/images/Safe-World.png" alt="Online Security" />
              </div>
            </Box>
            </Grid>
            <Grid
              className=' !flex !flex-col !items-center !justify-center'
              size={{
                xs: 12,
                sm: 12,
                md: 6
              }}>

              <Box sx={{
                width: {md:'80%', sm:'90%', xs:'90%'}
              }} >
                <Box className="mt-4 md:mt-0 flex gap-10 items-end pl-4 md:pl-8">
                  <p className='text-[35px] leading-[45px] md:leading-[37px]  md:text-[40px] font-bold'>+15K</p>
                  <p className=' text-base text-[18px] md:text-[20px]'>{t('unshortened-url')}</p>
                </Box>
                <div className="!h-[1px] !max-h-[1px] w-full dark:bg-light-gray dark:opacity-30 bg-dark-bg opacity-20 my-5" />
              </Box>

              <Box sx={{
                width: {md:'80%', sm:'90%', xs:'90%'}
              }} >
                <Box className="mt-4 md:mt-0 flex gap-10 items-end pl-4 md:pl-8">
                  <p className=' text-[35px] leading-[45px] md:leading-[37px]  md:text-[40px] font-bold'>+25K</p>
                  <p className=' text-base text-[18px] md:text-[20px]'>{t('active-users')}</p>
                </Box>
                <div className="!h-[1px] !max-h-[1px] w-full dark:bg-light-gray dark:opacity-30 bg-dark-bg opacity-20 my-5" />
              </Box>

              <Box sx={{
                width: {md:'80%', sm:'90%', xs:'90%'}
              }} >
                <Box className="mt-4 md:mt-0 flex gap-10 items-end pl-4 md:pl-8">
                  <p className=' text-[35px] leading-[45px] md:leading-[37px]  md:text-[40px] font-bold'>+10M</p>
                  <p className=' text-base text-[18px] md:text-[20px]'>{t('malicious-url')}</p>
                </Box>
                <div className="!h-[1px] !max-h-[1px] w-full dark:bg-light-gray dark:opacity-30 bg-dark-bg opacity-20 my-5" />
              </Box>

              <Box sx={{
                width: {md:'80%', sm:'90%', xs:'90%'}
              }} >
                <Box className="mt-4 md:mt-0 flex gap-10 items-end pl-4 md:pl-8">
                  <p className=' text-[35px] leading-[45px] md:leading-[37px]  md:text-[40px] font-bold'>+350</p>
                  <p className=' text-base text-[18px] md:text-[20px]'>{t('apps-supported')}</p>
                </Box>
              </Box>

            </Grid>
        </Grid>
    </Box>
    </section>
  );
}

export default Stats
