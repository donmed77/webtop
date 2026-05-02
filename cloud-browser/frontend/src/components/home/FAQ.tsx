import { Accordion, AccordionDetails, AccordionSummary, Box, Grid } from '@mui/material'
import CheveronIcon from '../shared/icons/Cheveron'
import { useTranslations } from 'next-intl';


const FAQ = () => {


  const t = useTranslations('home.faq');

  const FAQdata = [
    {
        question: t('question-1'),
        answer: t('answer-1')
    },
    {
        question: t('question-2'),
        answer: t('answer-2')
    },
    {
        question: t('question-3'),
        answer: t('answer-3')
    },
    {
        question: t('question-4'),
        answer: t('answer-4')
    },
    {
        question: t('question-5'),
        answer: t('answer-5')
    },
    {
        question: t('question-6'),
        answer: t('answer-6')
    },
    {
        question: t('question-7'),
        answer: t('answer-7')
    },
    {
        question: t('question-8'),
        answer: t('answer-8')
    },
    {
        question: t('question-9'),
        answer: t('answer-9')
    },
    {
        question: t('question-10'),
        answer: t('answer-10')
    }
]


  return (
      <section id='faq' className='w-full flex flex-col items-center gap-8 md:gap-16'>
          <Box className='flex flex-col text-[35px] leading-[45px] md:leading-[50px]  md:text-[40px] font-extrabold text-center' sx={{
              width: {md:'60%', sm:'70%', xs:'90%'}
          }}>
            <h2>{t('title')}</h2>
          </Box>
          <Box sx={{ width: '100%' }}>
                <Grid
                    className=' !flex !flex-col !items-center !justify-center '
                    size={{
                        xs: 12,
                        sm: 12,
                        md: 6
                    }}>

                  {
                      FAQdata.map((data, index) => (
                          <Accordion key={index} className='!bg-white dark:!bg-transparent !drop-shadow-none !w-full !border-b !border-zinc-300 dark:!border-zinc-600 py-2 '>
                              <AccordionSummary
                              className='dark:!bg-transparent'
                              // expandIcon={<CheveronIcon dark={theme == 'dark'}/>}
                              expandIcon={<CheveronIcon />}
                              aria-controls="panel1-content"
                              id="panel1-header"
                              >
                              <p className='text-base text-[20px] lg:text-[23px] font-medium lg:font-normal'>{data.question}</p>
                              </AccordionSummary>
                              <AccordionDetails>
                              <p className='font-normal text-[16px] lg:text-[18px] leading-[25px] lg:leading-[30px] mt-2 md:mt-3 dark:opacity-80'>
                                  {data.answer}
                              </p>
                              </AccordionDetails>
                          </Accordion>
                      ))
                  }

            

                </Grid>
        </Box>
      </section>
  );
}

export default FAQ
