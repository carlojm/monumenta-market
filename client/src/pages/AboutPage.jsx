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
          <li>With a linked account, you can comment on a shop and suggest edits to its page.</li>
          <li>Just like shops can be marked as locked/unlocked, comments can be marked outdated/still relevant.</li>
          <li>Moderators or the shop's owner can review suggested edits. Shop owners and shop maintainers can edit their own shop directly.</li>
          <li>See closed shops and past edits in each plot's History tab.</li>
        </ul>

        <h3>Accounts and privacy</h3>
        <p>
          An account is your Minecraft name and a password. Open Minecraft and join using this site's URL as the IP to get
          a one-time code (see <Link to="/account?tab=link">Link a new account</Link>).
        </p>
        <p>
          The site keeps your Minecraft name and ID, an encrypted copy of your password, and a history of your comments and edits. 
          IP addresses or any other information is not stored. Deleting your account turns your comments
          and edit attributions anonymous. Votes on comments are not shown publicly. 
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
