import { LaunchpadHeaderActions, Launchpad } from '../widgets/Launchpad/Launchpad';
import { NowPlaying } from '../widgets/NowPlaying/NowPlaying';
import { CalendarGlance } from '../widgets/Overview/CalendarGlance';
import { ContinueGlance } from '../widgets/Overview/ContinueGlance';
import { HorizonGlance } from '../widgets/Overview/HorizonGlance';
import { NewsGlance } from '../widgets/Overview/NewsGlance';
import { NotesTasksGlance } from '../widgets/Overview/NotesTasksGlance';
import { ProfileGlance } from '../widgets/Overview/ProfileGlance';
import { RecentActivityGlance } from '../widgets/Overview/RecentActivityGlance';
import { SystemGlance } from '../widgets/Overview/SystemGlance';
import { WeatherGlance } from '../widgets/Overview/WeatherGlance';
import { type PanelDef, PanelGrid } from '../primitives/PanelGrid/PanelGrid';
import styles from './Overview.module.css';

// Every section is a real PanelGrid panel - resizable/reorderable/
// hideable/persisted, same shared system Games/Homelab already use.
// Panel ids match server.py's DEFAULT_LAYOUTS["overview"] exactly.
export function Overview() {
  const panels: PanelDef[] = [
    {
      id: 'pad',
      label: 'Launchpad',
      minSize: { w: 1, h: 1 },
      headerAction: <LaunchpadHeaderActions />,
      content: <Launchpad />,
    },
    {
      id: 'ov-nowplaying',
      label: 'Now Playing',
      bleed: true,
      minSize: { w: 1, h: 1 },
      content: <NowPlaying />,
    },
    {
      id: 'ov-profile',
      label: 'Profile',
      minSize: { w: 1, h: 1 },
      content: <ProfileGlance />,
    },
    {
      id: 'ov-weather',
      label: 'Weather',
      minSize: { w: 1, h: 1 },
      content: <WeatherGlance />,
    },
    {
      id: 'ov-calendar',
      label: 'Calendar',
      minSize: { w: 1, h: 1 },
      content: <CalendarGlance />,
    },
    {
      id: 'ov-news',
      label: 'For You',
      minSize: { w: 1, h: 1 },
      content: <NewsGlance />,
    },
    {
      id: 'ov-notes-tasks',
      label: 'Notes & Tasks',
      minSize: { w: 1, h: 1 },
      content: <NotesTasksGlance />,
    },
    {
      id: 'ov-recent',
      label: 'Recent Activity',
      minSize: { w: 1, h: 1 },
      content: <RecentActivityGlance />,
    },
    {
      id: 'ov-system',
      label: 'This PC',
      minSize: { w: 1, h: 1 },
      content: <SystemGlance />,
    },
    {
      id: 'ov-horizon',
      label: 'On the Horizon',
      minSize: { w: 1, h: 4 },
      content: <HorizonGlance />,
    },
    {
      id: 'ov-continue',
      label: 'Continue',
      minSize: { w: 2, h: 3 },
      content: <ContinueGlance />,
    },
  ];

  return (
    <div className={styles.overview}>
      <PanelGrid view="overview" panels={panels} />
    </div>
  );
}
