import { Link } from 'react-router-dom';
import { date } from '../format.js';

export default function PostCard({ post }) {
  return (
    <article className="post-card">
      <Link to={`/blog/${post.slug}`} className="post-card__cover" aria-hidden="true" tabIndex={-1}>{post.cover_emoji}</Link>
      <div className="post-card__body">
        <span className="tag">{post.category}</span>
        <h3><Link to={`/blog/${post.slug}`}>{post.title}</Link></h3>
        <p>{post.excerpt}</p>
        <small className="muted"><time dateTime={post.published_at}>{date(post.published_at)}</time> · {post.reading_minutes} min read</small>
      </div>
    </article>
  );
}
