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
          A directory of the player market on Monumenta: every plot on the market island, who runs it, what they sell,
          and whether it looks open. It started as a Google Doc and moved here so players can keep it up to date
          together.
        </p>

        <h3>Keeping it current</h3>
        <ul>
          <li>Anyone can report what a shop looks like right now (active, locked, vacant and so on) from its card.</li>
          <li>With a linked account you can comment on a shop and suggest edits to its page.</li>
          <li>Moderators or the shop's owner review suggested edits. Owners and maintainers can edit their own shop directly.</li>
          <li>Every change to a page is kept in its History tab, and can be put back.</li>
        </ul>

        <h3>Accounts and privacy</h3>
        <p>
          An account is your Minecraft name and a password. You link it by joining a small verification server, which
          gives you a one-time code (see <Link to="/account?tab=link">Link a new account</Link>). There is no email
          address, and none is asked for.
        </p>
        <p>
          The site keeps your Minecraft name and ID, a scrambled copy of your password, and what you post. Votes on
          comments aren't shown publicly. IP addresses aren't stored. Deleting your account turns your comments
          anonymous.
        </p>

        <h3>Credits</h3>
        <p>
          A fan project, not run by or affiliated with the Monumenta team. The code is open source on{' '}
          <a href="https://github.com/carlojm/monumenta-market">GitHub</a>.
        </p>
      </main>
    </div>
  );
}

export default AboutPage;
