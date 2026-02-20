// This script processes the runs data to identify the 45 Jobs vignette runs
// and maps definition IDs to value pairs

// All runs from the API query, filtered to Jobs only
const allRuns = [
  { id: "cmltv134f13d5p9cxecjywtx0", definitionId: "cmlsmyn9l0j3rxeiricruouia", name: "Jobs (Self Direction Action vs Power Dominance)", transcriptCount: 281, createdAt: "2026-02-19T19:34:37.072Z" },
  { id: "cmltv0bb113cap9cx4rjgnmhv", definitionId: "cmlsmyyzl0j4hxeir8pqjvuco", name: "Jobs (Self Direction Action vs Security Personal)", transcriptCount: 275, createdAt: "2026-02-19T19:34:01.021Z" },
  { id: "cmltuzl64134fp9cxdu82npjd", definitionId: "cmlsmz2tx0j57xeirfb6wfof4", name: "Jobs (Self Direction Action vs Conformity Interpersonal)", transcriptCount: 275, createdAt: "2026-02-19T19:33:27.149Z" },
  { id: "cmltuywba12lwp9cxcu577cb1", definitionId: "cmlsmz6b80j5xxeirs9x8zswh", name: "Jobs (Self Direction Action vs Tradition)", transcriptCount: 275, createdAt: "2026-02-19T19:32:54.934Z" },
  { id: "cmltuy61f120hp9cx6r0mb4xw", definitionId: "cmlsmz9jt0j6nxeirvtafwl0a", name: "Jobs (Self Direction Action vs Stimulation)", transcriptCount: 275, createdAt: "2026-02-19T19:32:20.884Z" },
  { id: "cmltuwmdw10xap9cx79zqey3e", definitionId: "cmlsmzcj00j7dxeirly5k7z0x", name: "Jobs (Self Direction Action vs Benevolence Dependability)", transcriptCount: 275, createdAt: "2026-02-19T19:31:08.756Z" },
  { id: "cmltuvrhq109bp9cx8e52g009", definitionId: "cmlsmzfgm0j83xeir4wvby0ru", name: "Jobs (Self Direction Action vs Universalism Nature)", transcriptCount: 275, createdAt: "2026-02-19T19:30:28.718Z" },
  { id: "cmltuuwgt0zmcp9cx1gxb4cgs", definitionId: "cmlsmzif70j8txeirrsw0ommj", name: "Jobs (Self Direction Action vs Achievement)", transcriptCount: 275, createdAt: "2026-02-19T19:29:48.509Z" },
  { id: "cmltuu1is0z0hp9cxmsh3mra6", definitionId: "cmlsmzlbg0j9jxeirhpzpz4f2", name: "Jobs (Self Direction Action vs Hedonism)", transcriptCount: 275, createdAt: "2026-02-19T19:29:08.405Z" },
  { id: "cmltut53e0ybip9cxki1z8n3s", definitionId: "cmlsmztzp0ja9xeirsi8adqjo", name: "Jobs (Power Dominance vs Security Personal)", transcriptCount: 275, createdAt: "2026-02-19T19:28:26.379Z" },
  { id: "cmltusevs0xsbp9cx4nfr6niw", definitionId: "cmlsmzxts0jazxeir2vk5jc9r", name: "Jobs (Power Dominance vs Conformity Interpersonal)", transcriptCount: 275, createdAt: "2026-02-19T19:27:52.408Z" },
  { id: "cmlturoiz0x8cp9cxls13hafl", definitionId: "cmlsn01fp0jbpxeirfxofqzp1", name: "Jobs (Power Dominance vs Tradition)", transcriptCount: 275, createdAt: "2026-02-19T19:27:18.252Z" },
  { id: "cmltuqy7l0wolp9cxenhaoyr0", definitionId: "cmlsn04vw0jcfxeir9f88utlw", name: "Jobs (Power Dominance vs Stimulation)", transcriptCount: 275, createdAt: "2026-02-19T19:26:44.145Z" },
  { id: "cmltuq9hh0w56p9cxzsylz7op", definitionId: "cmlsn07ay0jd5xeira814cpgh", name: "Jobs (Power Dominance vs Benevolence Dependability)", transcriptCount: 275, createdAt: "2026-02-19T19:26:12.101Z" },
  { id: "cmltuoz320uvjp9cx15fxxek7", definitionId: "cmlsn0a8u0jdvxeir30j1t96q", name: "Jobs (Power Dominance vs Universalism Nature)", transcriptCount: 275, createdAt: "2026-02-19T19:25:11.966Z" },
  { id: "cmltunzjf0tvsp9cx0m29o0b9", definitionId: "cmlsn0d2k0jelxeir192w21y4", name: "Jobs (Power Dominance vs Achievement)", transcriptCount: 275, createdAt: "2026-02-19T19:24:25.900Z" },
  { id: "cmltun65l0t41p9cxaw7nfim6", definitionId: "cmlsn0gaf0jfbxeirchtbq6yf", name: "Jobs (Power Dominance vs Hedonism)", transcriptCount: 275, createdAt: "2026-02-19T19:23:47.817Z" },
  { id: "cmltumcrv0sbup9cx9462szj7", definitionId: "cmlsn0pnr0jg1xeir147758pr", name: "Jobs (Security Personal vs Conformity Interpersonal)", transcriptCount: 275, createdAt: "2026-02-19T19:23:09.739Z" },
  { id: "cmltulo2b0rnbp9cxdduwhty0", definitionId: "cmlsn0t860jgrxeir776k9439", name: "Jobs (Security Personal vs Tradition)", transcriptCount: 275, createdAt: "2026-02-19T19:22:37.716Z" },
  { id: "cmltukxrj0qxop9cxpgepyfqt", definitionId: "cmlsn0wca0jhhxeirdxiu8mtb", name: "Jobs (Security Personal vs Stimulation)", transcriptCount: 275, createdAt: "2026-02-19T19:22:03.631Z" },
  { id: "cmltuk7ik0q7pp9cxac61xvr4", definitionId: "cmlsn0zlf0ji7xeiravcd5oio", name: "Jobs (Security Personal vs Benevolence Dependability)", transcriptCount: 275, createdAt: "2026-02-19T19:21:29.612Z" },
  { id: "cmltujh6x0phqp9cxm0sju1n3", definitionId: "cmlsn12j60jixxeirql0k3a5n", name: "Jobs (Security Personal vs Universalism Nature)", transcriptCount: 275, createdAt: "2026-02-19T19:20:55.497Z" },
  { id: "cmltuiqx30oopp9cxh2ivsxyq", definitionId: "cmlsn1bs40jl3xeiri7j3jrvb", name: "Jobs (Conformity Interpersonal vs Tradition)", transcriptCount: 275, createdAt: "2026-02-19T19:20:21.447Z" },
  { id: "cmltui27m0o04p9cxktxwp1ea", definitionId: "cmlsn15po0jjnxeirfxvwrt3s", name: "Jobs (Security Personal vs Achievement)", transcriptCount: 275, createdAt: "2026-02-19T19:19:49.426Z" },
  { id: "cmltuhbz00nc5p9cxv5k5848u", definitionId: "cmlsn18ho0jkdxeirzumtgpm9", name: "Jobs (Security Personal vs Hedonism)", transcriptCount: 275, createdAt: "2026-02-19T19:19:15.420Z" },
  { id: "cmltufizz0lbip9cxo3svupue", definitionId: "cmlsn1ffh0jltxeirfxtxdboh", name: "Jobs (Conformity Interpersonal vs Stimulation)", transcriptCount: 275, createdAt: "2026-02-19T19:17:51.216Z" },
  { id: "cmltuekyo0k6fp9cx9kz6kwmk", definitionId: "cmlsn1iik0jmjxeirggiekxvu", name: "Jobs (Conformity Interpersonal vs Benevolence Dependability)", transcriptCount: 275, createdAt: "2026-02-19T19:17:07.105Z" },
  { id: "cmltudrnc0j7op9cx4clvv20f", definitionId: "cmlsn1lch0jn9xeirt220zmq7", name: "Jobs (Conformity Interpersonal vs Universalism Nature)", transcriptCount: 275, createdAt: "2026-02-19T19:16:29.113Z" },
  { id: "cmltucv540i5xp9cx8p89kf12", definitionId: "cmlsn1obw0jnzxeir185nw98k", name: "Jobs (Conformity Interpersonal vs Achievement)", transcriptCount: 275, createdAt: "2026-02-19T19:15:46.984Z" },
  { id: "cmltuc1s90h9mp9cx2pa8jihe", definitionId: "cmlsn1rnk0jopxeir9vb5g18v", name: "Jobs (Conformity Interpersonal vs Hedonism)", transcriptCount: 275, createdAt: "2026-02-19T19:15:08.938Z" },
  { id: "cmltub26z0g3fp9cxg061mch6", definitionId: "cmlsn216u0jpfxeirpdbrm9so", name: "Jobs (Tradition vs Stimulation)", transcriptCount: 275, createdAt: "2026-02-19T19:14:22.811Z" },
  { id: "cmltua8w10f4gp9cxg8yn3ngb", definitionId: "cmlsn26410jq5xeirg3zt75zs", name: "Jobs (Tradition vs Benevolence Dependability)", transcriptCount: 275, createdAt: "2026-02-19T19:13:44.833Z" },
  { id: "cmltu9e0s0e3xp9cxziplmpzi", definitionId: "cmlsn27zq0jqvxeir3sy7wen5", name: "Jobs (Tradition vs Universalism Nature)", transcriptCount: 275, createdAt: "2026-02-19T19:13:04.829Z" },
  { id: "cmltu8j810d2up9cxvexh9lh2", definitionId: "cmlsn2b710jrlxeir730eyx8l", name: "Jobs (Tradition vs Achievement)", transcriptCount: 275, createdAt: "2026-02-19T19:12:24.913Z" },
  { id: "cmltu7rcd0c6zp9cxrz9kg24e", definitionId: "cmlsn2dwy0jsbxeirs2bew2nq", name: "Jobs (Tradition vs Hedonism)", transcriptCount: 275, createdAt: "2026-02-19T19:11:48.782Z" },
  { id: "cmltu71480b7mp9cxc0jom03b", definitionId: "cmlsn2h5u0jt1xeir4kwq3gvj", name: "Jobs (Stimulation vs Benevolence Dependability)", transcriptCount: 275, createdAt: "2026-02-19T19:11:14.792Z" },
  { id: "cmltu66990a4lp9cxih5123wd", definitionId: "cmlsn2k3j0jtrxeir7nzsjdif", name: "Jobs (Stimulation vs Universalism Nature)", transcriptCount: 275, createdAt: "2026-02-19T19:10:34.797Z" },
  { id: "cmltu5g0b0972p9cxtjd0ilob", definitionId: "cmlsn2nac0juhxeirqggbjcb6", name: "Jobs (Stimulation vs Achievement)", transcriptCount: 275, createdAt: "2026-02-19T19:10:00.780Z" },
  { id: "cmltu4pqn08app9cx9jgpdlos", definitionId: "cmlsn2pz20jv7xeir18zthht5", name: "Jobs (Stimulation vs Hedonism)", transcriptCount: 275, createdAt: "2026-02-19T19:09:26.735Z" },
  { id: "cmltu3q9b0798p9cxubfznfoj", definitionId: "cmlsn2tca0jvxxeir5r0i5civ", name: "Jobs (Benevolence Dependability vs Universalism Nature)", transcriptCount: 275, createdAt: "2026-02-19T19:08:40.751Z" },
  { id: "cmltu300e06exp9cx91iu1skt", definitionId: "cmlsn2w8j0jwnxeirq7ubpg9f", name: "Jobs (Benevolence Dependability vs Achievement)", transcriptCount: 275, createdAt: "2026-02-19T19:08:06.734Z" },
  { id: "cmltu1xf9057yp9cxuaqozseh", definitionId: "cmlsn2zga0jxdxeirbnu8s390", name: "Jobs (Benevolence Dependability vs Hedonism)", transcriptCount: 275, createdAt: "2026-02-19T19:07:16.725Z" },
  { id: "cmltu17dq04f3p9cxoao8tc3i", definitionId: "cmlsn327s0jy3xeirzypdo8wz", name: "Jobs (Universalism Nature vs Achievement)", transcriptCount: 275, createdAt: "2026-02-19T19:06:42.974Z" },
  { id: "cmlttzqpw02r4p9cxunxmlxe4", definitionId: "cmlsn358l0jytxeir3rbp25hy", name: "Jobs (Universalism Nature vs Hedonism)", transcriptCount: 275, createdAt: "2026-02-19T19:05:34.725Z" },
  { id: "cmltpxe5u00566f2zilvyqcy2", definitionId: "cmlsn384i0jzjxeir9or2w35z", name: "Jobs (Achievement vs Hedonism)", transcriptCount: 275, createdAt: "2026-02-19T17:11:46.674Z" },
];

// Output run IDs for fetching transcripts
console.log(`Total runs: ${allRuns.length}`);
console.log(`Unique definitions: ${new Set(allRuns.map(r => r.definitionId)).size}`);

// Extract value pairs from names
for (const run of allRuns) {
  const match = run.name.match(/^Jobs \((.+) vs (.+)\)$/);
  if (match) {
    run.value_a = match[1].replace(/ /g, '_');
    run.value_b = match[2].replace(/ /g, '_');
  }
  console.log(`${run.id}: ${run.value_a} vs ${run.value_b} (${run.transcriptCount} transcripts)`);
}
