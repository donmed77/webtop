import Hero from '@/components/home/Hero';
import Features from "@/components/home/Features";
import Stats from "@/components/home/Stats";
import Sponsors from "@/components/home/Sponsors";
import Testimonials from "@/components/home/Testimonials";
import Trustpilot from "@/components/home/Trustpilot";
import FAQ from "@/components/home/FAQ";
const Main = ({link, scrapeId, data}:{link?:string, scrapeId?:number, data?:any}) => {
  return (
    <div className='flex flex-col py-10 gap-20 relative'>
      <Hero link={link} scrapeId={scrapeId} data={data}/>
      <Features />
      <Stats />
      <Sponsors />
      <Testimonials />
      <Trustpilot />
      <FAQ />
    </div>
  )
}

export default Main
