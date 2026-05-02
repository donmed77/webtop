import { Box, Grid } from '@mui/material'
import TestimonialCard from '../shared/TestimonialCard'
import { useTranslations } from 'next-intl';



const Testimonials = () => {
  
  const t = useTranslations('home.testimonials');
  
  const data = [
      {
          rating: 5,
          review: `Unshorten URL is fantastic for checking URL redirects. It’s fast, reliable, and ensures I only click safe links. Highly recommend!`,
          reviewer: 'Charly W'
      },
      {
          rating: 5,
          review: `I love using Unshorten URL to trace URL paths. It’s quick and easy, and gives me peace of mind with every link`,
          reviewer: 'Dan S'
      },
      {
          rating: 5,
          review: `Unshorten URL is my go-to tool for expanding shortened URLs. It helps me verify where links will take me before I click`,
          reviewer: 'Aleyda M'
      },
  
  ]

  return (
    <section className='w-full flex flex-col items-center gap-16'>
      <Box className='flex flex-col text-[35px] leading-[45px] md:leading-[50px]  md:text-[40px] font-extrabold text-center' sx={{
        width: {md:'60%', sm:'70%', xs:'90%'}
      }}>
       <h2>{t('title')}</h2> 
        </Box>
      <Box sx={{ width: '100%' }}>
      <Grid container rowSpacing={{ xs: 2, sm: 2, md: 3 }} columnSpacing={{ xs: 1, sm: 2, md: 3 }}>
        {data.map((item, index) => (
          <Grid
            key={index}
            sx={{
              alignItems: 'start',
              alignContent: 'start'
            }}
            size={{
              xs: 12,
              sm: 6,
              md: 6,
              lg: 4
            }}>
            <TestimonialCard {...item} />
          </Grid>
        ))}
      </Grid>
    </Box>
    </section>
  );
}

export default Testimonials
