import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import './AboutPage.css';

// What the site is, how to help keep it current, and what it keeps about you.
function AboutPage() {
  return (
    <div>
      <Navbar />
      <main className="about-page">
        <h2>About</h2>
        <p>
          The Monumenta Market Directory is a website now! Tracks every plot on the market island, who runs it, what they sell,
          and whether it looks open. This site solves the problems of previous directory iterations by
          letting players contribute to keep the directory updated.
        </p>

        <h3>Ways to contribute</h3>
        <ul>
          <li>Anyone can report what a shop looks like right now (active, locked, vacant, etc.) from its card.</li>
          <li>Want to quickly add a note about a shop? With a linked account, you can comment on plot pages.</li>
          <li>Just like shops can be marked as locked/unlocked, comments can be marked outdated/still relevant.</li>
          <li>For bigger changes, press the Edit button to suggest an edit of a shop's information.</li>
          <li>Moderators or the shop's owners can review suggested edits. Shop owners and shop maintainers can edit their own shop directly.</li>
          <li>See closed shops and past edits in each plot's History tab.</li>
          <li>Use tags to easily catalog an item's stock and services.</li>
        </ul>

        <h3>Accounts and privacy</h3>
        <p>
          An account is just your Minecraft name and a password. Join this site's URL like you would a Minecraft server to get
          a one-time code and verify your username. (see <Link to="/account?tab=link">Link a new account</Link>).
        </p>
        <p>
          The site keeps your Minecraft name and ID, an encrypted copy of your password, and a history of your comments and edits. 
          IP addresses or any other information is not stored. Deleting your account turns your comments
          and edit attributions anonymous. Votes on comments are not shown publicly. 
        </p>
        <p>
          Your Minecraft username will be shown next to your comments and edits. If you are a shop owner,
          you will automatically receive permission to freely edit your own shop and review edits suggested by others. 
        </p>

        <h3>Credits and Attribution</h3>
        <p>
          This is a fan project not affiliated with Team Monumenta, Mojang, or Minecraft.
        </p>
        <p>Thanks to beta testers: weekendtech, Endertective</p>
        <p>Code written with AI assistance. No generative AI used. Designed and orchestrated by ME! carlo_m</p>

      </main>
    </div>
  );
}

export default AboutPage;
