import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion'

interface FaqAccordionProps {
  siteTitle: string
}

export default function FaqAccordion({ siteTitle }: FaqAccordionProps) {
  return (
    <Accordion type="single" collapsible>
      <AccordionItem value="what-is">
        <AccordionTrigger>Where is the music?</AccordionTrigger>
        <AccordionContent>
          VODs published on {siteTitle} do not include music due to copyright
          restrictions. During the stream, music is played on a separate audio
          track that isn't included in the archived VODs. This helps avoid
          copyright claims and ensures the archive can be enjoyed by everyone
          without legal issues.
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="missing-vods">
        <AccordionTrigger>Why is this stream not archived?</AccordionTrigger>
        <AccordionContent>
          Not all streams are publicly archived on {siteTitle}. Some streams may
          have been excluded due to technical issues, leaking of personal
          information, or simply because it was decided to not archive them.
          However, the vast majority of streams are archived and available.
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="new-vods">
        <AccordionTrigger>How often is the archive updated?</AccordionTrigger>
        <AccordionContent>
          While the process of archiving streams is mostly automated, the
          process itself can take some time. VODs have to be exported from
          Twitch, after which a custom CLI tool is manually used to extract
          metadata, add them to the database, and publish them. This process can
          take anywhere from a few hours to multiple days. But, by doing it
          manually, it allows me to make sure the right streams are archived.
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="shows">
        <AccordionTrigger>What are shows?</AccordionTrigger>
        <AccordionContent>
          Shows are curated playlists that group related streams together into
          seasons and episodes. They make it easy to follow a series of streams
          in order, like a playthrough of a game or a recurring segment.
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="chat-replay" className='border-b-0'>
        <AccordionTrigger>What is chat replay?</AccordionTrigger>
        <AccordionContent>
          Chat replay is a feature that loads the Twitch chat messages that were
          sent during the stream and displays them in sync with the video. This
          helps so that you don't miss out on any of the interactions that
          happened during the broadcast. In technical terms, the chat messages
          with relative timestamps are stored in a repository and are loaded on
          demand when you open the watch page for a VOD.
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  )
}
